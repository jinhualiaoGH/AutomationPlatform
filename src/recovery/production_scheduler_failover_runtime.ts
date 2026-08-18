import type {
  DurableSchedulerStandbyAcquisitionSupervisorExit,
} from "./durable_scheduler_standby_acquisition_supervisor.js";

import type {
  SchedulerFailoverMode,
} from "./scheduler_failover_contract.js";


export interface ProductionSchedulerFailoverIntegration {
  readonly mode:
    SchedulerFailoverMode;

  shutdown():
    Promise<void>;
}


export interface ProductionSchedulerFailoverReacquisitionSupervisor {
  start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit>;

  stop():
    Promise<void>;
}


export type ProductionSchedulerFailoverRuntimeState =
  | "idle"
  | "running"
  | "stopped";


export interface ProductionSchedulerFailoverRuntimeSnapshot {
  readonly state:
    ProductionSchedulerFailoverRuntimeState;

  readonly mode:
    SchedulerFailoverMode;

  readonly isRunning:
    boolean;
}


/**
 * Production-facing lifecycle wrapper for durable scheduler failover.
 *
 * Authority remains below this layer:
 *
 * - A12 owns durable scheduler authority, generation and fencing.
 * - A13 owns standby/active transition and reacquisition semantics.
 * - A14 owns production lifecycle orchestration only.
 *
 * start() intentionally does not await acquisition. A production node is
 * considered running while it is healthy in standby and attempting to
 * acquire durable scheduler ownership.
 */
export class ProductionSchedulerFailoverRuntime {

  private stateValue:
    ProductionSchedulerFailoverRuntimeState =
    "idle";


  private supervisionValue:
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> |
    null =
    null;


  public constructor(
    private readonly integration:
      ProductionSchedulerFailoverIntegration,

    private readonly reacquisitionSupervisor:
      ProductionSchedulerFailoverReacquisitionSupervisor,
  ) {}


  public get state():
    ProductionSchedulerFailoverRuntimeState {

    return this.stateValue;
  }


  public get mode():
    SchedulerFailoverMode {

    return this.integration.mode;
  }


  public get supervision():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> |
    null {

    return this.supervisionValue;
  }


  public start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    if (
      this.stateValue ===
      "stopped"
    ) {
      throw new Error(
        "Production scheduler failover runtime has been stopped.",
      );
    }


    if (this.supervisionValue !== null) {
      return this.supervisionValue;
    }


    if (
      this.integration.mode !==
      "standby"
    ) {
      throw new Error(
        "Production scheduler failover runtime must start in standby.",
      );
    }


    const supervision =
      this.reacquisitionSupervisor.start();


    this.supervisionValue =
      supervision;

    this.stateValue =
      "running";


    return supervision;
  }


  public async stop():
    Promise<void> {

    if (
      this.stateValue ===
      "stopped"
    ) {
      return;
    }


    await this.reacquisitionSupervisor.stop();

    await this.integration.shutdown();


    this.stateValue =
      "stopped";
  }


  public snapshot():
    ProductionSchedulerFailoverRuntimeSnapshot {

    return Object.freeze({
      state:
        this.stateValue,

      mode:
        this.integration.mode,

      isRunning:
        this.stateValue ===
        "running",
    });
  }
}
