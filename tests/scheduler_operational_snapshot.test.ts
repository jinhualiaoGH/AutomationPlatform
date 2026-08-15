import {
  describe,
  expect,
  it,
} from "vitest";

import {
  captureSchedulerOperationalSnapshot,
} from "../src/operations/scheduler_operational_snapshot.js";

import type {
  SchedulerOperationalSource,
} from "../src/operations/scheduler_operational_snapshot.js";

import type {
  SchedulerPollingLoopResult,
} from "../src/scheduling/scheduler_polling_loop.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";

function pollingResult(
  overrides:
    Partial<SchedulerPollingLoopResult> =
    {},
): SchedulerPollingLoopResult {
  return {
    cycles:
      5,

    successfulCycles:
      5,

    failedCycles:
      0,

    candidates:
      8,

    dispatched:
      6,

    skipped:
      2,

    failedDispatches:
      0,

    lastEvaluatedAtUtc:
      new Date(
        "2026-08-15T13:00:00.000Z",
      ),

    lastCycleError:
      null,

    ...overrides,
  };
}

class FakeSource
implements SchedulerOperationalSource {
  public state:
    SchedulerRuntimeState =
    "idle";

  public isRunning =
    false;

  public result:
    SchedulerPollingLoopResult | null =
    null;

  public error:
    unknown = null;

  public getLastResult():
    SchedulerPollingLoopResult | null {
    return this.result;
  }

  public getTerminalError():
    unknown {
    return this.error;
  }
}

describe(
  "captureSchedulerOperationalSnapshot",
  () => {
    it(
      "captures an idle scheduler",
      () => {
        const source =
          new FakeSource();

        const observedAtUtc =
          new Date(
            "2026-08-15T14:00:00.000Z",
          );

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            observedAtUtc,
          );

        expect(snapshot.runtimeState)
          .toBe("idle");

        expect(snapshot.isRunning)
          .toBe(false);

        expect(snapshot.health)
          .toBe("idle");

        expect(snapshot.lastRun)
          .toBeNull();

        expect(snapshot.terminalError)
          .toBeNull();
      },
    );

    it(
      "captures a healthy running scheduler",
      () => {
        const source =
          new FakeSource();

        source.state =
          "running";

        source.isRunning =
          true;

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            new Date(
              "2026-08-15T14:00:00.000Z",
            ),
          );

        expect(snapshot.health)
          .toBe("healthy");

        expect(snapshot.isRunning)
          .toBe(true);
      },
    );

    it(
      "captures a stopped scheduler with its completed result",
      () => {
        const source =
          new FakeSource();

        source.state =
          "stopped";

        source.result =
          pollingResult();

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            new Date(
              "2026-08-15T14:00:00.000Z",
            ),
          );

        expect(snapshot.health)
          .toBe("stopped");

        expect(snapshot.lastRun?.cycles)
          .toBe(5);

        expect(snapshot.lastRun?.dispatched)
          .toBe(6);
      },
    );

    it(
      "clones mutable Date values from the runtime result",
      () => {
        const source =
          new FakeSource();

        source.state =
          "stopped";

        source.result =
          pollingResult();

        const observedAtUtc =
          new Date(
            "2026-08-15T14:00:00.000Z",
          );

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            observedAtUtc,
          );

        expect(snapshot.observedAtUtc)
          .not.toBe(
            observedAtUtc,
          );

        expect(
          snapshot.lastRun
            ?.lastEvaluatedAtUtc,
        ).not.toBe(
          source.result
            .lastEvaluatedAtUtc,
        );

        expect(
          snapshot.lastRun
            ?.lastEvaluatedAtUtc
            ?.toISOString(),
        ).toBe(
          "2026-08-15T13:00:00.000Z",
        );
      },
    );

    it(
      "captures terminal runtime failure",
      () => {
        const source =
          new FakeSource();

        source.state =
          "failed";

        source.error =
          new Error(
            "scheduler terminated",
          );

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            new Date(
              "2026-08-15T14:00:00.000Z",
            ),
          );

        expect(snapshot.health)
          .toBe("failed");

        expect(snapshot.terminalError)
          .toBe(
            "scheduler terminated",
          );
      },
    );

    it(
      "normalizes a non-Error terminal failure safely",
      () => {
        const source =
          new FakeSource();

        source.state =
          "failed";

        source.error = {
          arbitrary:
            true,
        };

        const snapshot =
          captureSchedulerOperationalSnapshot(
            source,
            new Date(
              "2026-08-15T14:00:00.000Z",
            ),
          );

        expect(snapshot.terminalError)
          .toBe(
            "Unknown scheduler runtime error.",
          );
      },
    );

    it(
      "rejects an invalid observation time",
      () => {
        const source =
          new FakeSource();

        expect(
          () =>
            captureSchedulerOperationalSnapshot(
              source,
              new Date(
                Number.NaN,
              ),
            ),
        ).toThrow(
          "observedAtUtc must be a valid Date.",
        );
      },
    );

    it(
      "rejects inconsistent runtime state",
      () => {
        const source =
          new FakeSource();

        source.state =
          "running";

        source.isRunning =
          false;

        expect(
          () =>
            captureSchedulerOperationalSnapshot(
              source,
              new Date(
                "2026-08-15T14:00:00.000Z",
              ),
            ),
        ).toThrow(
          "running state requires isRunning=true",
        );
      },
    );
  },
);
