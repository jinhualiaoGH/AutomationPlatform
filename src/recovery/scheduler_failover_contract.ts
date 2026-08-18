export type SchedulerFailoverMode =
  | "standby"
  | "active"
  | "fail_closed";

export type SchedulerFailoverSignal =
  | {
      readonly kind: "ownership_acquired";
    }
  | {
      readonly kind: "ownership_contended";
    }
  | {
      readonly kind: "ownership_renewed";
    }
  | {
      readonly kind: "ownership_released";
    }
  | {
      readonly kind: "ownership_lost";
    }
  | {
      readonly kind: "generation_mismatch";
    }
  | {
      readonly kind: "runtime_quiesced";
    }
  | {
      readonly kind: "shutdown";
    };

export type SchedulerFailoverAction =
  | "remain_standby"
  | "activate_runtime"
  | "remain_active"
  | "deactivate_runtime"
  | "remain_fail_closed"
  | "enter_standby"
  | "stop";

export interface SchedulerFailoverDecision {
  readonly nextMode: SchedulerFailoverMode;
  readonly action: SchedulerFailoverAction;
}

/**
 * Pure failover state-transition contract.
 *
 * A12 remains the sole source of durable scheduler authority.
 *
 * This contract does not acquire ownership, renew ownership,
 * release ownership, manufacture fencing tokens, advance durable
 * generations, construct ownership repositories, or perform I/O.
 *
 * Controlled reentry:
 *
 * ACTIVE
 *   -> authority loss
 * FAIL_CLOSED
 *   -> runtime_quiesced
 * STANDBY
 *   -> fresh A12 ownership acquisition
 * ACTIVE
 *
 * runtime_quiesced never grants scheduler ownership.
 */
export function decideSchedulerFailoverTransition(
  currentMode: SchedulerFailoverMode,
  signal: SchedulerFailoverSignal,
): SchedulerFailoverDecision {
  if (signal.kind === "shutdown") {
    return {
      nextMode: currentMode,
      action: "stop",
    };
  }

  switch (currentMode) {
    case "standby": {
      switch (signal.kind) {
        case "ownership_acquired":
          return {
            nextMode: "active",
            action: "activate_runtime",
          };

        case "ownership_contended":
        case "ownership_released":
        case "ownership_lost":
        case "generation_mismatch":
        case "runtime_quiesced":
          return {
            nextMode: "standby",
            action: "remain_standby",
          };

        case "ownership_renewed":
          /*
           * Renewal alone cannot establish initial A13 authority.
           */
          return {
            nextMode: "standby",
            action: "remain_standby",
          };
      }

      break;
    }

    case "active": {
      switch (signal.kind) {
        case "ownership_acquired":
        case "ownership_renewed":
          return {
            nextMode: "active",
            action: "remain_active",
          };

        case "ownership_contended":
        case "ownership_released":
        case "ownership_lost":
        case "generation_mismatch":
        case "runtime_quiesced":
          return {
            nextMode: "fail_closed",
            action: "deactivate_runtime",
          };
      }

      break;
    }

    case "fail_closed": {
      /*
       * Fail-closed remains sticky until the previously authorized
       * runtime explicitly confirms that it is fully quiesced.
       *
       * Quiescence grants no ownership authority. It permits only
       * return to standby. A fresh A12 ownership acquisition remains
       * mandatory before any subsequent runtime activation.
       */
      if (signal.kind === "runtime_quiesced") {
        return {
          nextMode: "standby",
          action: "enter_standby",
        };
      }

      return {
        nextMode: "fail_closed",
        action: "remain_fail_closed",
      };
    }
  }

  throw new Error(
    "Unhandled scheduler failover transition.",
  );
}