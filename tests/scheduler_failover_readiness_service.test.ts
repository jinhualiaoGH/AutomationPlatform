import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  SchedulerFailoverStatusReader,
} from "../src/recovery/failover_aware_scheduler_status.js";

import type {
  SchedulerFailoverOperationalStatus,
} from "../src/recovery/scheduler_failover_operational_status.js";

import {
  SchedulerFailoverReadinessService,
} from "../src/recovery/scheduler_failover_readiness_service.js";


function failoverStatus(
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


class FakeFailoverStatusReader
implements SchedulerFailoverStatusReader {

  public calls =
    0;


  public value:
    SchedulerFailoverOperationalStatus =
      failoverStatus();


  public snapshot():
    SchedulerFailoverOperationalStatus {

    this.calls +=
      1;

    return this.value;
  }
}


describe(
  "SchedulerFailoverReadinessService",
  () => {

    it(
      "projects standby as not ready",
      () => {

        const source =
          new FakeFailoverStatusReader();

        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        expect(
          service.snapshot(),
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
      "projects active scheduler as ready",
      () => {

        const source =
          new FakeFailoverStatusReader();

        source.value =
          failoverStatus({
            mode:
              "active",

            schedulerAuthority:
              "active",

            schedulerActive:
              true,
          });


        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        expect(
          service.snapshot(),
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
      "projects fail-closed scheduler as not ready",
      () => {

        const source =
          new FakeFailoverStatusReader();

        source.value =
          failoverStatus({
            mode:
              "fail_closed",

            schedulerAuthority:
              "fail_closed",

            schedulerActive:
              false,
          });


        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        expect(
          service.snapshot(),
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

        const source =
          new FakeFailoverStatusReader();

        source.value =
          failoverStatus({
            runtimeState:
              "stopped",

            processHealthy:
              false,
          });


        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        expect(
          service.snapshot(),
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
      "reads current failover state for every readiness request",
      () => {

        const source =
          new FakeFailoverStatusReader();

        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        const first =
          service.snapshot();


        expect(first.ready)
          .toBe(false);

        expect(first.state)
          .toBe("standby");


        source.value =
          failoverStatus({
            mode:
              "active",

            schedulerAuthority:
              "active",

            schedulerActive:
              true,
          });


        const second =
          service.snapshot();


        expect(second.ready)
          .toBe(true);

        expect(second.state)
          .toBe("ready");

        expect(source.calls)
          .toBe(2);
      },
    );


    it(
      "does not cache active readiness after authority is lost",
      () => {

        const source =
          new FakeFailoverStatusReader();

        source.value =
          failoverStatus({
            mode:
              "active",

            schedulerAuthority:
              "active",

            schedulerActive:
              true,
          });


        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        expect(
          service.snapshot().ready,
        ).toBe(true);


        source.value =
          failoverStatus({
            mode:
              "fail_closed",

            schedulerAuthority:
              "fail_closed",

            schedulerActive:
              false,
          });


        expect(
          service.snapshot(),
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
      "does not mutate the underlying failover status",
      () => {

        const source =
          new FakeFailoverStatusReader();

        const original =
          source.value;

        const service =
          new SchedulerFailoverReadinessService(
            source,
          );


        service.snapshot();


        expect(source.value)
          .toBe(original);

        expect(source.value)
          .toEqual(
            failoverStatus(),
          );
      },
    );
  },
);
