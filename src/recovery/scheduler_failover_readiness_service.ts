import type {
  SchedulerFailoverStatusReader,
} from "./failover_aware_scheduler_status.js";

import {
  projectSchedulerFailoverReadiness,
  type SchedulerFailoverReadiness,
} from "./scheduler_failover_readiness.js";


/**
 * Read-only operational readiness reader.
 *
 * Implementations expose current readiness without owning or mutating
 * scheduler failover lifecycle state.
 */
export interface SchedulerFailoverReadinessReader {

  snapshot():
    SchedulerFailoverReadiness;
}


/**
 * Projects the current A15 failover operational status into the A16
 * readiness contract on every read.
 *
 * No readiness state is cached here. The A15 failover status source
 * remains authoritative for current failover state.
 */
export class SchedulerFailoverReadinessService
implements SchedulerFailoverReadinessReader {

  public constructor(
    private readonly failoverStatus:
      SchedulerFailoverStatusReader,
  ) {}


  public snapshot():
    SchedulerFailoverReadiness {

    return projectSchedulerFailoverReadiness(
      this.failoverStatus.snapshot(),
    );
  }
}
