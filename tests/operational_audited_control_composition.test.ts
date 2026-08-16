import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuditedSchedulerControlExecutor,
} from "../src/operations/audited_scheduler_control_executor.js";

import {
  createOperationalComposition,
} from "../src/operations/operational_composition.js";

import {
  SchedulerControlCoordinator,
} from "../src/operations/scheduler_control_coordinator.js";

import {
  SchedulerControlService,
} from "../src/operations/scheduler_control_service.js";

import {
  SchedulerControlAuditRepository,
} from "../src/repositories/scheduler_control_audit_repository.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

describe(
  "A8.6 audited operational control composition",
  () => {
    it(
      "constructs one durable control chain around the shared runtime",
      () => {
        const operational =
          createOperationalComposition();

        expect(
          operational.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
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

        expect(
          operational.controlAuditRepository,
        ).toBeInstanceOf(
          SchedulerControlAuditRepository,
        );

        expect(
          operational.auditedControlExecutor,
        ).toBeInstanceOf(
          AuditedSchedulerControlExecutor,
        );
      },
    );

    it(
      "does not mutate the scheduler merely by constructing the durable control plane",
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
      },
    );
  },
);
