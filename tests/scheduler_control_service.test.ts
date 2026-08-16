import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlService,
} from "../src/operations/scheduler_control_service.js";

import type {
  SchedulerControlTarget,
} from "../src/operations/scheduler_control_service.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";

class FakeScheduler
implements SchedulerControlTarget {
  public state:
    SchedulerRuntimeState =
    "idle";

  public startCalls =
    0;

  public stopCalls =
    0;

  public stopError:
    unknown =
    null;

  public get isRunning():
    boolean {
    return this.state ===
      "running";
  }

  public start():
    void {
    this.startCalls++;

    if (this.state !== "idle") {
      throw new Error(
        "SchedulerRuntime can only be started once.",
      );
    }

    this.state =
      "running";
  }

  public async stop():
    Promise<void> {
    this.stopCalls++;

    if (this.stopError !== null) {
      throw this.stopError;
    }

    if (this.state === "running") {
      this.state =
        "stopped";
    }
  }
}

describe(
  "SchedulerControlService",
  () => {
    it(
      "starts an idle scheduler exactly once",
      () => {
        const scheduler =
          new FakeScheduler();

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          service.start();

        expect(result)
          .toEqual({
            command:
              "start",

            disposition:
              "executed",

            previousState:
              "idle",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });

        expect(scheduler.startCalls)
          .toBe(1);

        expect(scheduler.stopCalls)
          .toBe(0);
      },
    );

    it(
      "rejects start while already running without touching runtime start",
      () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "running";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          service.start();

        expect(result.disposition)
          .toBe(
            "rejected",
          );

        expect(result.previousState)
          .toBe(
            "running",
          );

        expect(result.currentState)
          .toBe(
            "running",
          );

        expect(result.changed)
          .toBe(false);

        expect(result.reason)
          .toBe(
            "SchedulerRuntime is single-start and can only start from idle.",
          );

        expect(scheduler.startCalls)
          .toBe(0);
      },
    );

    it(
      "rejects restart after the scheduler has stopped",
      () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "stopped";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          service.start();

        expect(result.disposition)
          .toBe(
            "rejected",
          );

        expect(result.previousState)
          .toBe(
            "stopped",
          );

        expect(result.currentState)
          .toBe(
            "stopped",
          );

        expect(scheduler.startCalls)
          .toBe(0);
      },
    );

    it(
      "rejects restart after terminal scheduler failure",
      () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "failed";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          service.start();

        expect(result.disposition)
          .toBe(
            "rejected",
          );

        expect(result.previousState)
          .toBe(
            "failed",
          );

        expect(result.currentState)
          .toBe(
            "failed",
          );

        expect(scheduler.startCalls)
          .toBe(0);
      },
    );

    it(
      "stops a running scheduler and awaits completion",
      async () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "running";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          await service.stop();

        expect(result)
          .toEqual({
            command:
              "stop",

            disposition:
              "executed",

            previousState:
              "running",

            currentState:
              "stopped",

            changed:
              true,

            reason:
              null,
          });

        expect(scheduler.stopCalls)
          .toBe(1);

        expect(scheduler.startCalls)
          .toBe(0);
      },
    );

    it(
      "treats stop while idle as a governed no-op",
      async () => {
        const scheduler =
          new FakeScheduler();

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          await service.stop();

        expect(result.disposition)
          .toBe(
            "noop",
          );

        expect(result.previousState)
          .toBe(
            "idle",
          );

        expect(result.currentState)
          .toBe(
            "idle",
          );

        expect(result.changed)
          .toBe(false);

        expect(result.reason)
          .toBe(
            "SchedulerRuntime is not currently running.",
          );

        expect(scheduler.stopCalls)
          .toBe(0);
      },
    );

    it(
      "treats repeated stop after shutdown as a governed no-op",
      async () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "stopped";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          await service.stop();

        expect(result.disposition)
          .toBe(
            "noop",
          );

        expect(result.currentState)
          .toBe(
            "stopped",
          );

        expect(result.changed)
          .toBe(false);

        expect(scheduler.stopCalls)
          .toBe(0);
      },
    );

    it(
      "treats stop after terminal failure as a governed no-op",
      async () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "failed";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const result =
          await service.stop();

        expect(result.disposition)
          .toBe(
            "noop",
          );

        expect(result.currentState)
          .toBe(
            "failed",
          );

        expect(result.changed)
          .toBe(false);

        expect(scheduler.stopCalls)
          .toBe(0);
      },
    );

    it(
      "propagates a scheduler start failure",
      () => {
        const scheduler:
          SchedulerControlTarget = {
            state:
              "idle",

            isRunning:
              false,

            start:
              () => {
                throw new Error(
                  "synthetic start failure",
                );
              },

            stop:
              async () => {},
          };

        const service =
          new SchedulerControlService(
            scheduler,
          );

        expect(
          () =>
            service.start(),
        ).toThrow(
          "synthetic start failure",
        );
      },
    );

    it(
      "propagates a scheduler stop failure",
      async () => {
        const scheduler =
          new FakeScheduler();

        scheduler.state =
          "running";

        scheduler.stopError =
          new Error(
            "synthetic stop failure",
          );

        const service =
          new SchedulerControlService(
            scheduler,
          );

        await expect(
          service.stop(),
        ).rejects.toThrow(
          "synthetic stop failure",
        );

        expect(scheduler.stopCalls)
          .toBe(1);
      },
    );
  },
);
