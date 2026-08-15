import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createOperationalComposition,
} from "../src/operations/operational_composition.js";

import {
  ExecutionHistoryService,
} from "../src/operations/execution_history_service.js";

import {
  SchedulerMetricsAccumulator,
} from "../src/operations/scheduler_metrics.js";

import {
  SchedulerStatusService,
} from "../src/operations/scheduler_status_service.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

describe(
  "createOperationalComposition",
  () => {
    it(
      "constructs one coherent read-only operational plane",
      () => {
        const operational =
          createOperationalComposition();

        expect(
          operational.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          operational.metrics,
        ).toBeInstanceOf(
          SchedulerMetricsAccumulator,
        );

        expect(
          operational.statusService,
        ).toBeInstanceOf(
          SchedulerStatusService,
        );

        expect(
          operational.historyService,
        ).toBeInstanceOf(
          ExecutionHistoryService,
        );
      },
    );

    it(
      "starts with idle runtime state and zero live metrics",
      () => {
        const operational =
          createOperationalComposition();

        expect(
          operational.scheduler.state,
        ).toBe(
          "idle",
        );

        expect(
          operational.scheduler.isRunning,
        ).toBe(false);

        expect(
          operational.metrics
            .getSnapshot(),
        ).toMatchObject({
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
        });
      },
    );

    it(
      "projects the composed idle runtime through SchedulerStatusService",
      () => {
        const operational =
          createOperationalComposition();

        const status =
          operational.statusService
            .getStatus();

        expect(status.runtimeState)
          .toBe(
            "idle",
          );

        expect(status.isRunning)
          .toBe(false);

        expect(status.health)
          .toBe(
            "idle",
          );

        expect(status.metrics.cycles)
          .toBe(0);
      },
    );
  },
);
