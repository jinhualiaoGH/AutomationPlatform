import {
  describe,
  expect,
  it,
} from "vitest";

import {
  FailoverAwareSchedulerStatusService,
  type SchedulerOperationalStatusReader,
} from "../src/recovery/failover_aware_scheduler_status_service.js";

import type {
  SchedulerFailoverStatusReader,
} from "../src/recovery/failover_aware_scheduler_status.js";

import type {
  SchedulerFailoverOperationalStatus,
} from "../src/recovery/scheduler_failover_operational_status.js";


type ExistingStatus = {
  readonly observedAtUtc:
    Date;

  readonly runtimeState:
    string;

  readonly isRunning:
    boolean;

  readonly health:
    string;

  readonly terminalError:
    string |
    null;

  readonly metrics: {
    readonly polls:
      number;
  };
};


class FakeSchedulerStatus
implements SchedulerOperationalStatusReader<ExistingStatus> {

  public calls =
    0;


  public value:
    ExistingStatus = {
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
      },
    };


  public getStatus():
    ExistingStatus {

    this.calls +=
      1;

    return this.value;
  }
}


class FakeFailoverStatus
implements SchedulerFailoverStatusReader {

  public calls =
    0;


  public value:
    SchedulerFailoverOperationalStatus =
      Object.freeze({
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


  public snapshot():
    SchedulerFailoverOperationalStatus {

    this.calls +=
      1;

    return this.value;
  }
}


describe(
  "FailoverAwareSchedulerStatusService",
  () => {

    it(
      "preserves the existing scheduler status",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        const status =
          service.getStatus();


        expect(status.observedAtUtc)
          .toBe(
            scheduler.value.observedAtUtc,
          );

        expect(status.runtimeState)
          .toBe("running");

        expect(status.isRunning)
          .toBe(true);

        expect(status.health)
          .toBe("healthy");

        expect(status.terminalError)
          .toBeNull();

        expect(status.metrics)
          .toBe(
            scheduler.value.metrics,
          );
      },
    );


    it(
      "adds live standby failover status",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        expect(
          service.getStatus().failover,
        ).toEqual({
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
      "reflects transition from standby to active",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        expect(
          service.getStatus().failover.mode,
        ).toBe("standby");


        failover.value =
          Object.freeze({
            runtimeState:
              "running",

            mode:
              "active",

            schedulerAuthority:
              "active",

            processHealthy:
              true,

            schedulerActive:
              true,
          });


        expect(
          service.getStatus().failover.mode,
        ).toBe("active");

        expect(
          service.getStatus()
            .failover
            .schedulerActive,
        ).toBe(true);
      },
    );


    it(
      "reflects fail-closed without rewriting scheduler health",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        failover.value =
          Object.freeze({
            runtimeState:
              "running",

            mode:
              "fail_closed",

            schedulerAuthority:
              "fail_closed",

            processHealthy:
              true,

            schedulerActive:
              false,
          });


        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        const status =
          service.getStatus();


        expect(status.health)
          .toBe("healthy");

        expect(status.failover.mode)
          .toBe("fail_closed");

        expect(
          status.failover.schedulerActive,
        ).toBe(false);
      },
    );


    it(
      "reads both underlying authorities for every status request",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        service.getStatus();
        service.getStatus();


        expect(scheduler.calls)
          .toBe(2);

        expect(failover.calls)
          .toBe(2);
      },
    );


    it(
      "does not mutate the status returned by the existing service",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        service.getStatus();


        expect(
          "failover" in scheduler.value,
        ).toBe(false);
      },
    );


    it(
      "returns an immutable combined status",
      () => {

        const scheduler =
          new FakeSchedulerStatus();

        const failover =
          new FakeFailoverStatus();

        const service =
          new FailoverAwareSchedulerStatusService(
            scheduler,
            failover,
          );


        const result =
          service.getStatus();


        expect(
          Object.isFrozen(result),
        ).toBe(true);

        expect(
          Object.isFrozen(result.failover),
        ).toBe(true);
      },
    );
  },
);
