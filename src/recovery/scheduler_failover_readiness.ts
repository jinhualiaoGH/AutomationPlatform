import type {
  SchedulerFailoverOperationalStatus,
} from "./scheduler_failover_operational_status.js";


/**
 * Operational readiness is intentionally distinct from failover state.
 *
 * A14 remains authoritative for scheduler failover lifecycle state.
 * A15 exposes that lifecycle through the operational status plane.
 *
 * A16 derives only whether this process is currently ready to provide
 * active scheduler service.
 */
export type SchedulerFailoverReadinessState =
  | "ready"
  | "standby"
  | "fail_closed"
  | "stopped";


export type SchedulerFailoverReadinessReason =
  | "scheduler_active"
  | "scheduler_standby"
  | "scheduler_fail_closed"
  | "scheduler_stopped";


export interface SchedulerFailoverReadiness {
  readonly ready:
    boolean;

  readonly state:
    SchedulerFailoverReadinessState;

  readonly reason:
    SchedulerFailoverReadinessReason;
}


/**
 * Derives operational readiness from the frozen A15 failover
 * operational-status contract.
 *
 * Runtime stop has precedence because a stopped failover supervisor
 * cannot provide scheduler service regardless of its last mode.
 *
 * Otherwise:
 *
 * active      -> ready
 * standby     -> not ready
 * fail_closed -> not ready
 */
export function projectSchedulerFailoverReadiness(
  status:
    SchedulerFailoverOperationalStatus,
):
SchedulerFailoverReadiness {

  if (
    status.runtimeState ===
    "stopped"
  ) {
    return {
      ready:
        false,

      state:
        "stopped",

      reason:
        "scheduler_stopped",
    };
  }


  switch (status.mode) {

    case "active":
      return {
        ready:
          true,

        state:
          "ready",

        reason:
          "scheduler_active",
      };


    case "standby":
      return {
        ready:
          false,

        state:
          "standby",

        reason:
          "scheduler_standby",
      };


    case "fail_closed":
      return {
        ready:
          false,

        state:
          "fail_closed",

        reason:
          "scheduler_fail_closed",
      };
  }
}
