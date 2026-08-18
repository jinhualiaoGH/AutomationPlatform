import {
  describe,
  expect,
  it,
} from "vitest";

import {
  attachSchedulerFailoverStatus,
  type SchedulerFailoverStatusReader,
} from "../src/recovery/failover_aware_scheduler_status.js";

import type {
  SchedulerFailoverOperationalStatus,
} from "../src/recovery/scheduler_failover_operational_status.js";


function failoverStatus(
  overrides:
    Partial<SchedulerFailoverOperationalStatus> =
      {},
):
SchedulerFailoverOperationalStatus {

  return Object.freeze({
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
  });
}


class FakeFailoverReader
implements SchedulerFailoverStatusReader {

  public value:
    SchedulerFailoverOperationalStatus =
    failoverStatus();


  public snapshot():
    SchedulerFailoverOperationalStatus {

    return this.value;
  }
}


describe(
  "attachSchedulerFailoverStatus",
  () => {

    it(
      "preserves every existing scheduler status field",
      () => {

        const status = {
          observedAtUtc:
            new Date(
              "2026-08-18T02:00:00.000Z",
            ),

          runtimeState:
            "running",

          isRunning:
            true,

          health:
            "healthy",

          terminalError:
            null,

          metrics: {
            polls:
              17,

            dispatched:
              4,
          },
        };


        const reader =
          new FakeFailoverReader();


        const result =
          attachSchedulerFailoverStatus(
            status,
            reader,
          );


        expect(result.observedAtUtc)
          .toBe(status.observedAtUtc);

        expect(result.runtimeState)
          .toBe(status.runtimeState);

        expect(result.isRunning)
          .toBe(true);

        expect(result.health)
          .toBe("healthy");

        expect(result.terminalError)
          .toBeNull();

        expect(result.metrics)
          .toBe(status.metrics);
      },
    );


    it(
      "adds standby failover status",
      () => {

        const reader =
          new FakeFailoverReader();


        const result =
          attachSchedulerFailoverStatus(
            {
              runtimeState:
                "idle",
            },
            reader,
          );


        expect(result.failover)
          .toEqual({
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
          });
      },
    );


    it(
      "projects active scheduler authority",
      () => {

        const reader =
          new FakeFailoverReader();

        reader.value =
          failoverStatus({
            mode:
              "active",

            schedulerAuthority:
              "active",

            schedulerActive:
              true,
          });


        const result =
          attachSchedulerFailoverStatus(
            {
              runtimeState:
                "running",
            },
            reader,
          );


        expect(result.failover.mode)
          .toBe("active");

        expect(
          result.failover.schedulerActive,
        ).toBe(true);
      },
    );


    it(
      "projects fail-closed independently from existing scheduler health",
      () => {

        const reader =
          new FakeFailoverReader();

        reader.value =
          failoverStatus({
            mode:
              "fail_closed",

            schedulerAuthority:
              "fail_closed",

            schedulerActive:
              false,
          });


        const result =
          attachSchedulerFailoverStatus(
            {
              health:
                "healthy",
            },
            reader,
          );


        expect(result.health)
          .toBe("healthy");

        expect(result.failover.mode)
          .toBe("fail_closed");

        expect(
          result.failover.schedulerActive,
        ).toBe(false);
      },
    );


    it(
      "does not confuse stopped failover supervision with existing scheduler status",
      () => {

        const reader =
          new FakeFailoverReader();

        reader.value =
          failoverStatus({
            runtimeState:
              "stopped",

            processHealthy:
              false,

            schedulerActive:
              false,
          });


        const result =
          attachSchedulerFailoverStatus(
            {
              runtimeState:
                "stopped",

              health:
                "stopped",
            },
            reader,
          );


        expect(result.runtimeState)
          .toBe("stopped");

        expect(
          result.failover.processHealthy,
        ).toBe(false);
      },
    );


    it(
      "does not mutate the original scheduler status",
      () => {

        const original = {
          runtimeState:
            "running",

          metrics: {
            polls:
              10,
          },
        };


        const reader =
          new FakeFailoverReader();


        attachSchedulerFailoverStatus(
          original,
          reader,
        );


        expect(
          "failover" in original,
        ).toBe(false);

        expect(original)
          .toEqual({
            runtimeState:
              "running",

            metrics: {
              polls:
                10,
            },
          });
      },
    );


    it(
      "returns a defensive immutable top-level projection",
      () => {

        const reader =
          new FakeFailoverReader();


        const result =
          attachSchedulerFailoverStatus(
            {
              runtimeState:
                "running",
            },
            reader,
          );


        expect(
          Object.isFrozen(result),
        ).toBe(true);

        expect(
          Object.isFrozen(result.failover),
        ).toBe(true);
      },
    );


    it(
      "reads current failover state for every projection",
      () => {

        const reader =
          new FakeFailoverReader();


        const first =
          attachSchedulerFailoverStatus(
            {},
            reader,
          );


        expect(first.failover.mode)
          .toBe("standby");


        reader.value =
          failoverStatus({
            mode:
              "active",

            schedulerAuthority:
              "active",

            schedulerActive:
              true,
          });


        const second =
          attachSchedulerFailoverStatus(
            {},
            reader,
          );


        expect(second.failover.mode)
          .toBe("active");

        expect(
          second.failover.schedulerActive,
        ).toBe(true);
      },
    );
  },
);
