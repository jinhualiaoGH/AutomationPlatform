import type {
  SchedulerFailoverMode,
} from "./scheduler_failover_contract.js";

import type {
  ProductionSchedulerFailoverRuntimeState,
} from "./production_scheduler_failover_runtime.js";


export interface SchedulerFailoverOperationalStatusSource {
  readonly state:
    ProductionSchedulerFailoverRuntimeState;

  readonly mode:
    SchedulerFailoverMode;
}


export type SchedulerFailoverOperationalStatus = {
  readonly runtimeState:
    ProductionSchedulerFailoverRuntimeState;

  readonly mode:
    SchedulerFailoverMode;

  readonly schedulerAuthority:
    "standby" |
    "active" |
    "fail_closed";

  readonly processHealthy:
    boolean;

  readonly schedulerActive:
    boolean;
};


export class SchedulerFailoverOperationalStatusProjector {

  public constructor(
    private readonly source:
      SchedulerFailoverOperationalStatusSource,
  ) {}


  public snapshot():
    SchedulerFailoverOperationalStatus {

    const runtimeState =
      this.source.state;

    const mode =
      this.source.mode;


    return Object.freeze({
      runtimeState,

      mode,

      schedulerAuthority:
        mode,

      processHealthy:
        runtimeState !==
        "stopped",

      schedulerActive:
        runtimeState ===
          "running" &&
        mode ===
          "active",
    });
  }
}
