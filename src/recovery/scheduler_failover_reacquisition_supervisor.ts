import {
  type DurableSchedulerStandbyAcquisitionSupervisorExit,
} from "./durable_scheduler_standby_acquisition_supervisor.js";

import {
  type SchedulerFailoverMode,
  type SchedulerFailoverSignal,
} from "./scheduler_failover_contract.js";


export interface SchedulerReacquisitionFailoverIntegration {
  readonly mode:
    SchedulerFailoverMode;

  handleAuthoritySignal(
    signal:
      Extract<
        SchedulerFailoverSignal,
        {
          readonly kind:
            | "ownership_contended"
            | "ownership_released"
            | "ownership_lost"
            | "generation_mismatch";
        }
      >,
  ): Promise<void>;

  runtimeQuiesced():
    Promise<void>;
}


export interface SchedulerStandbyAcquisitionCycle {
  start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit>;

  stop():
    Promise<void>;
}


export interface SchedulerStandbyAcquisitionCycleFactory {
  create():
    SchedulerStandbyAcquisitionCycle;
}


export class SchedulerFailoverReacquisitionSupervisor {

  private currentCycle:
    SchedulerStandbyAcquisitionCycle |
    null =
    null;


  private currentRun:
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> |
    null =
    null;


  private reentryRun:
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> |
    null =
    null;


  private stoppedValue =
    false;


  private cycleCountValue =
    0;


  public constructor(
    private readonly integration:
      SchedulerReacquisitionFailoverIntegration,

    private readonly acquisitionCycles:
      SchedulerStandbyAcquisitionCycleFactory,
  ) {}


  public get stopped():
    boolean {

    return this.stoppedValue;
  }


  public get cycleCount():
    number {

    return this.cycleCountValue;
  }


  public start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    if (this.stoppedValue) {
      throw new Error(
        "Scheduler reacquisition supervision has been stopped.",
      );
    }


    if (this.currentRun !== null) {
      return this.currentRun;
    }


    if (
      this.integration.mode !==
      "standby"
    ) {
      throw new Error(
        "Scheduler acquisition cycle may begin only from standby.",
      );
    }


    return this.startFreshCycle();
  }


  private startFreshCycle():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    if (this.currentRun !== null) {
      return this.currentRun;
    }


    const cycle =
      this.acquisitionCycles.create();


    this.currentCycle =
      cycle;


    this.cycleCountValue +=
      1;


    let run:
      Promise<DurableSchedulerStandbyAcquisitionSupervisorExit>;


    run =
      cycle
        .start()
        .finally(
          () => {

            if (
              this.currentRun ===
              run
            ) {
              this.currentRun =
                null;


              this.currentCycle =
                null;
            }
          },
        );


    this.currentRun =
      run;


    return run;
  }


  public async handleAuthoritySignal(
    signal:
      Extract<
        SchedulerFailoverSignal,
        {
          readonly kind:
            | "ownership_contended"
            | "ownership_released"
            | "ownership_lost"
            | "generation_mismatch";
        }
      >,
  ): Promise<void> {

    if (this.stoppedValue) {
      return;
    }


    await this.integration.handleAuthoritySignal(
      signal,
    );


    /*
     * Authority loss may transition ACTIVE -> FAIL_CLOSED,
     * but it must never create a new acquisition loop.
     *
     * Reacquisition remains prohibited until runtimeQuiesced()
     * explicitly transitions the frozen failover contract back
     * to STANDBY.
     */
    if (
      this.integration.mode ===
      "fail_closed"
    ) {

      const cycle =
        this.currentCycle;


      if (cycle !== null) {
        await cycle.stop();
      }
    }
  }


  public runtimeQuiescedAndReacquire():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    if (this.stoppedValue) {
      throw new Error(
        "Scheduler reacquisition supervision has been stopped.",
      );
    }


    /*
     * Coalesce duplicate quiescence/reentry requests.
     * Exactly one fresh acquisition generation is permitted.
     */
    if (this.reentryRun !== null) {
      return this.reentryRun;
    }


    if (
      this.integration.mode !==
      "fail_closed"
    ) {
      throw new Error(
        "Runtime quiescence reentry requires fail_closed state.",
      );
    }


    let reentry:
      Promise<DurableSchedulerStandbyAcquisitionSupervisorExit>;


    reentry =
      this.performRuntimeQuiescedReentry()
        .finally(
          () => {

            if (
              this.reentryRun ===
              reentry
            ) {
              this.reentryRun =
                null;
            }
          },
        );


    this.reentryRun =
      reentry;


    return reentry;
  }


  private async performRuntimeQuiescedReentry():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    const previousCycle =
      this.currentCycle;


    if (previousCycle !== null) {
      await previousCycle.stop();
    }


    if (this.currentRun !== null) {
      await this.currentRun;
    }


    await this.integration.runtimeQuiesced();


    if (
      this.integration.mode !==
      "standby"
    ) {
      throw new Error(
        "Runtime quiescence did not establish standby state.",
      );
    }


    if (this.stoppedValue) {
      return Object.freeze({
        kind:
          "stopped",
      });
    }


    return this.startFreshCycle();
  }


  public async stop():
    Promise<void> {

    if (this.stoppedValue) {
      return;
    }


    this.stoppedValue =
      true;


    const cycle =
      this.currentCycle;


    if (cycle !== null) {
      await cycle.stop();
    }


    if (this.currentRun !== null) {
      await this.currentRun;
    }


    if (this.reentryRun !== null) {
      await this.reentryRun;
    }
  }
}