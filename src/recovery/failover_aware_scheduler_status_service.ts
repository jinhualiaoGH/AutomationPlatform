import {
  attachSchedulerFailoverStatus,
  type FailoverAwareSchedulerStatus,
  type SchedulerFailoverStatusReader,
} from "./failover_aware_scheduler_status.js";


export interface SchedulerOperationalStatusReader<
  TStatus extends object,
> {
  getStatus():
    TStatus;
}


/**
 * Decorates the existing scheduler status service without changing
 * its scheduler-runtime semantics.
 *
 * The underlying service remains authoritative for:
 *
 * - runtime state
 * - scheduler health
 * - terminal error
 * - scheduler metrics
 *
 * A15 adds only the A14 failover projection.
 */
export class FailoverAwareSchedulerStatusService<
  TStatus extends object,
> {

  public constructor(
    private readonly scheduler:
      SchedulerOperationalStatusReader<TStatus>,

    private readonly failover:
      SchedulerFailoverStatusReader,
  ) {}


  public getStatus():
    FailoverAwareSchedulerStatus<TStatus> {

    return attachSchedulerFailoverStatus(
      this.scheduler.getStatus(),
      this.failover,
    );
  }
}
