import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  SchedulerFailoverMode,
} from "../src/recovery/scheduler_failover_contract.js";

import type {
  ProductionSchedulerFailoverRuntimeState,
} from "../src/recovery/production_scheduler_failover_runtime.js";

import {
  SchedulerFailoverOperationalStatusProjector,
  type SchedulerFailoverOperationalStatusSource,
} from "../src/recovery/scheduler_failover_operational_status.js";


class FakeSource
implements SchedulerFailoverOperationalStatusSource {

  public state:
    ProductionSchedulerFailoverRuntimeState =
    "idle";


  public mode:
    SchedulerFailoverMode =
    "standby";
}


describe(
  "SchedulerFailoverOperationalStatusProjector",
  () => {

    it(
      "projects idle standby",
      () => {

        const source =
          new FakeSource();

        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(projector.snapshot())
          .toEqual({
            runtimeState:
              "idle",

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
      "treats running standby as healthy but inactive",
      () => {

        const source =
          new FakeSource();

        source.state =
          "running";

        source.mode =
          "standby";


        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(projector.snapshot())
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

        const source =
          new FakeSource();

        source.state =
          "running";

        source.mode =
          "active";


        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(projector.snapshot())
          .toEqual({
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
      },
    );


    it(
      "projects fail-closed as healthy process without active scheduler authority",
      () => {

        const source =
          new FakeSource();

        source.state =
          "running";

        source.mode =
          "fail_closed";


        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(projector.snapshot())
          .toEqual({
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
      },
    );


    it(
      "projects stopped runtime as unhealthy for failover supervision",
      () => {

        const source =
          new FakeSource();

        source.state =
          "stopped";

        source.mode =
          "standby";


        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(projector.snapshot())
          .toEqual({
            runtimeState:
              "stopped",

            mode:
              "standby",

            schedulerAuthority:
              "standby",

            processHealthy:
              false,

            schedulerActive:
              false,
          });
      },
    );


    it(
      "returns defensive immutable snapshots",
      () => {

        const source =
          new FakeSource();

        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        const snapshot =
          projector.snapshot();


        expect(
          Object.isFrozen(snapshot),
        ).toBe(true);
      },
    );


    it(
      "reflects source state changes without caching stale status",
      () => {

        const source =
          new FakeSource();

        const projector =
          new SchedulerFailoverOperationalStatusProjector(
            source,
          );


        expect(
          projector.snapshot().mode,
        ).toBe(
          "standby",
        );


        source.state =
          "running";

        source.mode =
          "active";


        expect(
          projector.snapshot().mode,
        ).toBe(
          "active",
        );

        expect(
          projector.snapshot().schedulerActive,
        ).toBe(
          true,
        );
      },
    );
  },
);
