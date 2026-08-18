import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateSchedulerControlAdmission,
  type SchedulerControlAdmissionCommand,
} from "../src/recovery/scheduler_control_admission.js";

import type {
  SchedulerFailoverReadiness,
} from "../src/recovery/scheduler_failover_readiness.js";


const commands:
  readonly SchedulerControlAdmissionCommand[] =
  [
    "start",
    "stop",
    "restart",
  ];


function readiness(
  overrides:
    Partial<SchedulerFailoverReadiness> =
      {},
):
SchedulerFailoverReadiness {

  return {
    ready:
      true,

    state:
      "ready",

    reason:
      "scheduler_active",

    ...overrides,
  };
}


describe(
  "evaluateSchedulerControlAdmission",
  () => {

    for (const command of commands) {

      it(
        `admits ${command} while scheduler authority is active`,
        () => {

          expect(
            evaluateSchedulerControlAdmission(
              command,
              readiness(),
            ),
          ).toEqual({
            admitted:
              true,
          });
        },
      );
    }


    for (const command of commands) {

      it(
        `rejects ${command} while the node is standby`,
        () => {

          expect(
            evaluateSchedulerControlAdmission(
              command,
              readiness({
                ready:
                  false,

                state:
                  "standby",

                reason:
                  "scheduler_standby",
              }),
            ),
          ).toEqual({
            admitted:
              false,

            reason:
              "scheduler_standby",
          });
        },
      );
    }


    for (const command of commands) {

      it(
        `rejects ${command} while fail-closed`,
        () => {

          expect(
            evaluateSchedulerControlAdmission(
              command,
              readiness({
                ready:
                  false,

                state:
                  "fail_closed",

                reason:
                  "scheduler_fail_closed",
              }),
            ),
          ).toEqual({
            admitted:
              false,

            reason:
              "scheduler_fail_closed",
          });
        },
      );
    }


    for (const command of commands) {

      it(
        `rejects ${command} after failover supervision stops`,
        () => {

          expect(
            evaluateSchedulerControlAdmission(
              command,
              readiness({
                ready:
                  false,

                state:
                  "stopped",

                reason:
                  "scheduler_stopped",
              }),
            ),
          ).toEqual({
            admitted:
              false,

            reason:
              "scheduler_stopped",
          });
        },
      );
    }


    it(
      "fails closed for a contradictory ready-state snapshot",
      () => {

        expect(
          evaluateSchedulerControlAdmission(
            "restart",
            {
              ready:
                false,

              state:
                "ready",

              reason:
                "scheduler_active",
            },
          ),
        ).toEqual({
          admitted:
            false,

          reason:
            "scheduler_stopped",
        });
      },
    );
  },
);
