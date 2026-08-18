import type {
  SchedulerFailoverOperationalStatus,
} from "./scheduler_failover_operational_status.js";


export interface SchedulerFailoverStatusReader {
  snapshot():
    SchedulerFailoverOperationalStatus;
}


export type FailoverAwareSchedulerStatus<
  TStatus extends object,
> =
  TStatus & {
    readonly failover:
      SchedulerFailoverOperationalStatus;
  };


/**
 * Adds durable scheduler failover observability to an existing
 * scheduler operational status object without changing or
 * reinterpreting the existing status contract.
 *
 * A14 remains the authority for failover state.
 * A15 only projects that state operationally.
 */
export function attachSchedulerFailoverStatus<
  TStatus extends object,
>(
  status:
    TStatus,

  failover:
    SchedulerFailoverStatusReader,
):
FailoverAwareSchedulerStatus<TStatus> {

  const failoverSnapshot =
    failover.snapshot();


  return Object.freeze({
    ...status,

    failover:
      failoverSnapshot,
  });
}
