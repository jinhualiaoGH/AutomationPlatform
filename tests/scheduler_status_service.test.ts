import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerStatusService,
} from "../src/operations/scheduler_status_service.js";

import type {
  SchedulerMetricsSnapshot,
} from "../src/operations/scheduler_metrics.js";

import type {
  SchedulerOperationalSource,
} from "../src/operations/scheduler_operational_snapshot.js";

import type {
  SchedulerPollingLoopResult,
} from "../src/scheduling/scheduler_polling_loop.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";

function emptyMetrics(
  overrides:
    Partial<SchedulerMetricsSnapshot> =
    {},
): SchedulerMetricsSnapshot {
  return {
    cycles:
      0,

    successfulCycles:
      0,

    failedCycles:
      0,

    candidates:
      0,

    dispatched:
      0,

    skipped:
      0,

    failedDispatches:
      0,

    lastEvaluatedAtUtc:
      null,

    lastCycleError:
      null,

    ...overrides,
  };
}

class FakeRuntime
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
    unknown =
    null;

  public getLastResult():
    SchedulerPollingLoopResult | null {
    return this.result;
  }

  public getTerminalError():
    unknown {
    return this.error;
  }
}

class FakeMetricsSource {
  public snapshot:
    SchedulerMetricsSnapshot =
    emptyMetrics();

  public getSnapshot():
    SchedulerMetricsSnapshot {
    return this.snapshot;
  }
}

describe(
  "SchedulerStatusService",
  () => {
    it(
      "reports an idle scheduler",
      () => {
        const runtime =
          new FakeRuntime();

        const metrics =
          new FakeMetricsSource();

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.runtimeState)
          .toBe("idle");

        expect(status.isRunning)
          .toBe(false);

        expect(status.health)
          .toBe("idle");

        expect(status.terminalError)
          .toBeNull();

        expect(status.metrics.cycles)
          .toBe(0);
      },
    );

    it(
      "reports a healthy running scheduler with live metrics",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "running";

        runtime.isRunning =
          true;

        const metrics =
          new FakeMetricsSource();

        metrics.snapshot =
          emptyMetrics({
            cycles:
              4,

            successfulCycles:
              4,

            candidates:
              9,

            dispatched:
              7,

            skipped:
              2,

            lastEvaluatedAtUtc:
              new Date(
                "2026-08-15T15:59:59.000Z",
              ),
          });

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.health)
          .toBe("healthy");

        expect(status.metrics.cycles)
          .toBe(4);

        expect(status.metrics.dispatched)
          .toBe(7);
      },
    );

    it(
      "reports current degradation when the latest cycle failed",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "running";

        runtime.isRunning =
          true;

        const metrics =
          new FakeMetricsSource();

        metrics.snapshot =
          emptyMetrics({
            cycles:
              5,

            successfulCycles:
              4,

            failedCycles:
              1,

            lastCycleError:
              "database unavailable",
          });

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.health)
          .toBe("degraded");

        expect(
          status.metrics.lastCycleError,
        ).toBe(
          "database unavailable",
        );
      },
    );

    it(
      "returns to healthy after recovery while retaining historical failures",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "running";

        runtime.isRunning =
          true;

        const metrics =
          new FakeMetricsSource();

        metrics.snapshot =
          emptyMetrics({
            cycles:
              6,

            successfulCycles:
              5,

            failedCycles:
              1,

            lastCycleError:
              null,
          });

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.health)
          .toBe("healthy");

        expect(status.metrics.failedCycles)
          .toBe(1);

        expect(status.metrics.lastCycleError)
          .toBeNull();
      },
    );

    it(
      "reports terminal scheduler failure above live metrics",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "failed";

        runtime.error =
          new Error(
            "scheduler terminated",
          );

        const metrics =
          new FakeMetricsSource();

        metrics.snapshot =
          emptyMetrics({
            lastCycleError:
              "temporary cycle failure",
          });

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.health)
          .toBe("failed");

        expect(status.terminalError)
          .toBe(
            "scheduler terminated",
          );
      },
    );

    it(
      "reports a stopped scheduler without treating historical metrics as current degradation",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "stopped";

        const metrics =
          new FakeMetricsSource();

        metrics.snapshot =
          emptyMetrics({
            cycles:
              10,

            failedCycles:
              2,

            failedDispatches:
              3,
          });

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                "2026-08-15T16:00:00.000Z",
              ),
          );

        const status =
          service.getStatus();

        expect(status.health)
          .toBe("stopped");

        expect(status.metrics.failedCycles)
          .toBe(2);

        expect(
          status.metrics.failedDispatches,
        ).toBe(3);
      },
    );

    it(
      "returns defensive observation and metrics Date values",
      () => {
        const runtime =
          new FakeRuntime();

        runtime.state =
          "running";

        runtime.isRunning =
          true;

        const metrics =
          new FakeMetricsSource();

        const sourceDate =
          new Date(
            "2026-08-15T15:59:59.000Z",
          );

        metrics.snapshot =
          emptyMetrics({
            lastEvaluatedAtUtc:
              sourceDate,
          });

        const clockDate =
          new Date(
            "2026-08-15T16:00:00.000Z",
          );

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              clockDate,
          );

        const first =
          service.getStatus();

        const second =
          service.getStatus();

        expect(first.observedAtUtc)
          .not.toBe(
            clockDate,
          );

        expect(
          first.metrics.lastEvaluatedAtUtc,
        ).not.toBe(
          sourceDate,
        );

        expect(
          first.metrics.lastEvaluatedAtUtc,
        ).not.toBe(
          second.metrics.lastEvaluatedAtUtc,
        );

        first.metrics.lastEvaluatedAtUtc
          ?.setUTCFullYear(
            2035,
          );

        expect(
          second.metrics.lastEvaluatedAtUtc
            ?.toISOString(),
        ).toBe(
          "2026-08-15T15:59:59.000Z",
        );
      },
    );

    it(
      "rejects an invalid status clock value",
      () => {
        const runtime =
          new FakeRuntime();

        const metrics =
          new FakeMetricsSource();

        const service =
          new SchedulerStatusService(
            runtime,
            metrics,
            () =>
              new Date(
                Number.NaN,
              ),
          );

        expect(
          () =>
            service.getStatus(),
        ).toThrow(
          "clock result must be a valid Date.",
        );
      },
    );
  },
);
