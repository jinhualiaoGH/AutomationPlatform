import type {
  AcquireOrRenewSchedulerOwnershipResult,
} from "./durable_scheduler_ownership_engine.js";

import {
  DurableSchedulerStandbyAcquisitionSupervisor,
} from "./durable_scheduler_standby_acquisition_supervisor.js";

import {
  ProductionSchedulerFailoverRuntime,
  type ProductionSchedulerFailoverIntegration,
} from "./production_scheduler_failover_runtime.js";

import {
  SchedulerFailoverReacquisitionSupervisor,
  type SchedulerStandbyAcquisitionCycleFactory,
} from "./scheduler_failover_reacquisition_supervisor.js";

import {
  SchedulerStandbyActiveFailoverIntegration,
  type SchedulerFailoverRuntimeController,
  type SchedulerStandbyOwnershipAuthority,
} from "./scheduler_standby_active_failover_integration.js";

import type {
  SchedulerFailoverMode,
} from "./scheduler_failover_contract.js";

import type {
  ProductionSchedulerOwnershipRuntime,
} from "./production_scheduler_ownership_runtime_composition.js";

import type {
  DurableSchedulerOwnership,
} from "./durable_scheduler_ownership_contract.js";


export type ProductionSchedulerFailoverCompositionOptions = {
  readonly acquisitionIntervalMs:
    number;
};


export interface ProductionSchedulerFailoverOwnershipRuntime {
  readonly ownershipEngine: {
    acquireOrRenew(
      input: {
        readonly generation: number;
        readonly ownerId: string;
        readonly nowEpochMs: number;
        readonly leaseDurationMs: number;
      },
    ): Promise<AcquireOrRenewSchedulerOwnershipResult>;
  };

  start():
    Promise<unknown>;

  stop():
    Promise<unknown>;
}


export type ProductionSchedulerFailoverOwnershipCoordinates = {
  readonly generation:
    number;

  readonly ownerId:
    string;

  readonly leaseDurationMs:
    number;
};


export interface ProductionSchedulerFailoverClock {
  nowEpochMs():
    number;
}


export class SystemProductionSchedulerFailoverClock
implements ProductionSchedulerFailoverClock {

  public nowEpochMs():
    number {

    return Date.now();
  }
}


class ProductionSchedulerStandbyOwnershipAuthority
implements SchedulerStandbyOwnershipAuthority {

  public constructor(
    private readonly ownershipRuntime:
      ProductionSchedulerFailoverOwnershipRuntime,

    private readonly coordinates:
      ProductionSchedulerFailoverOwnershipCoordinates,

    private readonly clock:
      ProductionSchedulerFailoverClock,
  ) {}


  public acquireOrRenew():
    Promise<AcquireOrRenewSchedulerOwnershipResult> {

    return this.ownershipRuntime
      .ownershipEngine
      .acquireOrRenew({
        generation:
          this.coordinates.generation,

        ownerId:
          this.coordinates.ownerId,

        nowEpochMs:
          this.clock.nowEpochMs(),

        leaseDurationMs:
          this.coordinates.leaseDurationMs,
      });
  }
}


class ProductionSchedulerFailoverRuntimeController
implements SchedulerFailoverRuntimeController {

  public constructor(
    private readonly ownershipRuntime:
      ProductionSchedulerFailoverOwnershipRuntime,
  ) {}


  public async activate(
    _ownership:
      DurableSchedulerOwnership,
  ): Promise<void> {

    const result =
      await this.ownershipRuntime.start();


    if (
      typeof result ===
        "object" &&
      result !==
        null &&
      "kind" in result &&
      result.kind !==
        "started"
    ) {
      throw new Error(
        `Production scheduler ownership runtime activation failed: ${String(result.kind)}.`,
      );
    }
  }


  public async deactivate():
    Promise<void> {

    await this.ownershipRuntime.stop();
  }
}


class ProductionSchedulerStandbyAcquisitionCycleFactory
implements SchedulerStandbyAcquisitionCycleFactory {

  public constructor(
    private readonly integration:
      SchedulerStandbyActiveFailoverIntegration,

    private readonly acquisitionIntervalMs:
      number,
  ) {}


  public create():
    DurableSchedulerStandbyAcquisitionSupervisor {

    return new DurableSchedulerStandbyAcquisitionSupervisor(
      this.integration,
      {
        acquisitionIntervalMs:
          this.acquisitionIntervalMs,
      },
    );
  }
}


class ProductionSchedulerFailoverLifecycleIntegration
implements ProductionSchedulerFailoverIntegration {

  public constructor(
    private readonly failover:
      SchedulerStandbyActiveFailoverIntegration,

    private readonly ownershipRuntime:
      ProductionSchedulerFailoverOwnershipRuntime,
  ) {}


  public get mode():
    SchedulerFailoverMode {

    return this.failover.mode;
  }


  public async shutdown():
    Promise<void> {

    await this.ownershipRuntime.stop();
  }
}


export class ProductionSchedulerFailoverComposition {

  public readonly integration:
    SchedulerStandbyActiveFailoverIntegration;


  public readonly reacquisitionSupervisor:
    SchedulerFailoverReacquisitionSupervisor;


  public readonly runtime:
    ProductionSchedulerFailoverRuntime;


  public constructor(
    ownershipRuntime:
      ProductionSchedulerFailoverOwnershipRuntime,

    coordinates:
      ProductionSchedulerFailoverOwnershipCoordinates,

    options:
      ProductionSchedulerFailoverCompositionOptions,

    clock:
      ProductionSchedulerFailoverClock =
        new SystemProductionSchedulerFailoverClock(),
  ) {

    const authority =
      new ProductionSchedulerStandbyOwnershipAuthority(
        ownershipRuntime,
        coordinates,
        clock,
      );


    const runtimeController =
      new ProductionSchedulerFailoverRuntimeController(
        ownershipRuntime,
      );


    this.integration =
      new SchedulerStandbyActiveFailoverIntegration(
        authority,
        runtimeController,
      );


    const cycleFactory =
      new ProductionSchedulerStandbyAcquisitionCycleFactory(
        this.integration,
        options.acquisitionIntervalMs,
      );


    this.reacquisitionSupervisor =
      new SchedulerFailoverReacquisitionSupervisor(
        this.integration,
        cycleFactory,
      );


    const lifecycleIntegration =
      new ProductionSchedulerFailoverLifecycleIntegration(
        this.integration,
        ownershipRuntime,
      );


    this.runtime =
      new ProductionSchedulerFailoverRuntime(
        lifecycleIntegration,
        this.reacquisitionSupervisor,
      );
  }


  public get mode():
    SchedulerFailoverMode {

    return this.integration.mode;
  }
}


export function composeProductionSchedulerFailoverRuntime(
  ownershipRuntime:
    ProductionSchedulerOwnershipRuntime,

  coordinates:
    ProductionSchedulerFailoverOwnershipCoordinates,

  options:
    ProductionSchedulerFailoverCompositionOptions,
):
ProductionSchedulerFailoverComposition {

  return new ProductionSchedulerFailoverComposition(
    ownershipRuntime,
    coordinates,
    options,
  );
}
