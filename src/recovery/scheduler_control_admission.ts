import type {
  SchedulerFailoverReadiness,
} from "./scheduler_failover_readiness.js";


/**
 * Commands exposed by the coordinated production scheduler-control
 * surface.
 *
 * This contract is deliberately local to admission policy so A17 does
 * not modify any frozen A9-A16 control ABI.
 */
export type SchedulerControlAdmissionCommand =
  | "start"
  | "stop"
  | "restart";


export type SchedulerControlAdmissionDenialReason =
  | "scheduler_standby"
  | "scheduler_fail_closed"
  | "scheduler_stopped";


export type SchedulerControlAdmissionDecision =
  | {
      readonly admitted:
        true;
    }
  | {
      readonly admitted:
        false;

      readonly reason:
        SchedulerControlAdmissionDenialReason;
    };


/**
 * Scheduler control admission is an authority decision, not a health
 * transition.
 *
 * A14 owns failover lifecycle and scheduler activation.
 * A16 reports whether this process currently has active scheduler
 * authority.
 * A17 permits external scheduler-control mutation only while that
 * authority is active.
 *
 * The command parameter is intentionally explicit even though all
 * current mutation commands share the same admission rule. This keeps
 * the policy boundary ready for future command-specific rules without
 * changing callers.
 */
export function evaluateSchedulerControlAdmission(
  command:
    SchedulerControlAdmissionCommand,

  readiness:
    SchedulerFailoverReadiness,
):
SchedulerControlAdmissionDecision {

  void command;


  if (readiness.ready) {

    return {
      admitted:
        true,
    };
  }


  switch (readiness.state) {

    case "standby":
      return {
        admitted:
          false,

        reason:
          "scheduler_standby",
      };


    case "fail_closed":
      return {
        admitted:
          false,

        reason:
          "scheduler_fail_closed",
      };


    case "stopped":
      return {
        admitted:
          false,

        reason:
          "scheduler_stopped",
      };


    case "ready":
      /*
       * A contradictory readiness object must never grant authority.
       *
       * The frozen A16 projector never emits ready:false/state:"ready",
       * but A17 remains fail-closed if an alternate implementation
       * supplies such an inconsistent snapshot.
       */
      return {
        admitted:
          false,

        reason:
          "scheduler_stopped",
      };
  }
}
