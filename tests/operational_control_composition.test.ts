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
  SchedulerControlCoordinator,
} from "../src/operations/scheduler_control_coordinator.js";

import {
  SchedulerControlService,
} from "../src/operations/scheduler_control_service.js";

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
  "A8 operational control composition",
  () => {
    it(
      "constructs status history and control around one operational composition",
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

        expect(
          operational.controlService,
        ).toBeInstanceOf(
          SchedulerControlService,
        );

        expect(
          operational.controlCoordinator,
        ).toBeInstanceOf(
          SchedulerControlCoordinator,
        );
      },
    );

    it(
      "preserves idle scheduler status before application lifecycle startup",
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
      },
    );

    it(
      "routes an idle stop command through the composed coordinator without starting runtime",
      async () => {
        const operational =
          createOperationalComposition();

        const result =
          await operational
            .controlCoordinator
            .execute({
              command:
                "stop",

              requestKey:
                "composition-idle-stop",
            });

        expect(result)
          .toEqual({
            command:
              "stop",

            disposition:
              "noop",

            previousState:
              "idle",

            currentState:
              "idle",

            changed:
              false,

            reason:
              "SchedulerRuntime is not currently running.",
          });

        expect(
          operational.scheduler.state,
        ).toBe(
          "idle",
        );
      },
    );
  },
);
