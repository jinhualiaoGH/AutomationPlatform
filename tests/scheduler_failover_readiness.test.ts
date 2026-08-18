import {
  describe,
  expect,
  it,
} from "vitest";

import {
  projectSchedulerFailoverReadiness,
} from "../src/recovery/scheduler_failover_readiness.js";

import type {
  SchedulerFailoverOperationalStatus,
} from "../src/recovery/scheduler_failover_operational_status.js";


function status(
  overrides:
    Partial<SchedulerFailoverOperationalStatus> =
      {},
):
SchedulerFailoverOperationalStatus {

  return {
    runtimeState:
      "running",

    mode:
      "standby",

    schedulerAuthority:
      "standby",

    processHealthy:
      true,

    schedulerActive:
      false,

    ...overrides,
  };
}


describe(
  "projectSchedulerFailoverReadiness",
  () => {

    it(
      "projects running active scheduler as ready",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status({
              mode:
                "active",

              schedulerAuthority:
                "active",

              schedulerActive:
                true,
            }),
          ),
        ).toEqual({
          ready:
            true,

          state:
            "ready",

          reason:
            "scheduler_active",
        });
      },
    );


    it(
      "projects running standby scheduler as not ready",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status(),
          ),
        ).toEqual({
          ready:
            false,

          state:
            "standby",

          reason:
            "scheduler_standby",
        });
      },
    );


    it(
      "projects idle standby scheduler as not ready",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status({
              runtimeState:
                "idle",
            }),
          ),
        ).toEqual({
          ready:
            false,

          state:
            "standby",

          reason:
            "scheduler_standby",
        });
      },
    );


    it(
      "projects fail-closed scheduler as not ready",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status({
              mode:
                "fail_closed",

              schedulerAuthority:
                "fail_closed",
            }),
          ),
        ).toEqual({
          ready:
            false,

          state:
            "fail_closed",

          reason:
            "scheduler_fail_closed",
        });
      },
    );


    it(
      "projects stopped supervision as not ready",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status({
              runtimeState:
                "stopped",
            }),
          ),
        ).toEqual({
          ready:
            false,

          state:
            "stopped",

          reason:
            "scheduler_stopped",
        });
      },
    );


    it(
      "gives stopped runtime precedence over last active mode",
      () => {

        expect(
          projectSchedulerFailoverReadiness(
            status({
              runtimeState:
                "stopped",

              mode:
                "active",

              schedulerAuthority:
                "active",

              processHealthy:
                false,

              schedulerActive:
                false,
            }),
          ),
        ).toEqual({
          ready:
            false,

          state:
            "stopped",

          reason:
            "scheduler_stopped",
        });
      },
    );
  },
);
