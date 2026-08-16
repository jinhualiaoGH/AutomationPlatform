import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  SchedulerControlService,
} from "../src/operations/scheduler_control_service.js";

import {
  SchedulerRecoveryControlAuditRepository,
} from "../src/repositories/scheduler_recovery_control_audit_repository.js";

import {
  AuditedRecoverySchedulerControlExecutor,
} from "../src/recovery/audited_recovery_scheduler_control_executor.js";

import {
  createRecoveryControlComposition,
} from "../src/recovery/recovery_control_composition.js";

import {
  ProductionSchedulerGenerationFactory,
} from "../src/recovery/production_scheduler_generation_factory.js";

import {
  RecoveryAwareSchedulerControlCoordinator,
} from "../src/recovery/recovery_aware_scheduler_control_coordinator.js";

import {
  RecoveryAwareSchedulerControlService,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";

import {
  SchedulerRecoverySupervisor,
} from "../src/recovery/scheduler_recovery_supervisor.js";

import {
  TriggerDispatcher,
} from "../src/scheduling/trigger_dispatcher.js";

describe(
  "createRecoveryControlComposition",
  () => {
    afterEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool
          .request()
          .query(`
            DELETE FROM
                dbo.scheduler_recovery_command_audit;
          `);

        await closeDatabase();
      },
    );

    it(
      "constructs the complete recovery-control object graph",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const composition =
          createRecoveryControlComposition(
            dispatcher,
          );

        expect(
          composition.generationFactory,
        ).toBeInstanceOf(
          ProductionSchedulerGenerationFactory,
        );

        expect(
          composition.supervisor,
        ).toBeInstanceOf(
          SchedulerRecoverySupervisor,
        );

        expect(
          composition.frozenControlService,
        ).toBeInstanceOf(
          SchedulerControlService,
        );

        expect(
          composition.recoveryControlService,
        ).toBeInstanceOf(
          RecoveryAwareSchedulerControlService,
        );

        expect(
          composition.coordinator,
        ).toBeInstanceOf(
          RecoveryAwareSchedulerControlCoordinator,
        );

        expect(
          composition.auditRepository,
        ).toBeInstanceOf(
          SchedulerRecoveryControlAuditRepository,
        );

        expect(
          composition.auditedExecutor,
        ).toBeInstanceOf(
          AuditedRecoverySchedulerControlExecutor,
        );
      },
    );

    it(
      "creates generation one in idle state without starting it",
      () => {
        const composition =
          createRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        expect(
          composition.supervisor.generation,
        ).toBe(
          1,
        );

        expect(
          composition.supervisor.state,
        ).toBe(
          "idle",
        );

        expect(
          composition.supervisor.isRunning,
        ).toBe(false);
      },
    );

    it(
      "preserves the frozen start semantics through the composed service",
      () => {
        const composition =
          createRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        const result =
          composition.recoveryControlService.start();

        expect(result)
          .toMatchObject({
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

        expect(
          composition.supervisor.generation,
        ).toBe(
          1,
        );

        expect(
          composition.supervisor.state,
        ).toBe(
          "running",
        );
      },
    );

    it(
      "performs a real generation replacement through the composed recovery path",
      async () => {
        const composition =
          createRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        composition.recoveryControlService.start();

        const result =
          await composition.coordinator.execute({
            command:
              "restart",

            requestKey:
              "composition-restart-001",
          });

        expect(result)
          .toMatchObject({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });

        expect(
          composition.supervisor.generation,
        ).toBe(
          2,
        );

        expect(
          composition.supervisor.state,
        ).toBe(
          "running",
        );

        await composition.supervisor.stop();
      },
      15_000,
    );

    it(
      "persists durable restart provenance through the complete audited path",
      async () => {
        const composition =
          createRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        composition.recoveryControlService.start();

        const result =
          await composition.auditedExecutor.execute({
            command:
              "restart",

            requestKey:
              "composition-audit-001",
          });

        expect(result)
          .toMatchObject({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,
          });

        const rows =
          await composition.auditRepository.listRecent(
            10,
          );

        expect(rows)
          .toHaveLength(
            1,
          );

        expect(rows[0])
          .toMatchObject({
            command:
              "restart",

            requestKey:
              "composition-audit-001",

            auditStatus:
              "completed",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            errorMessage:
              null,
          });

        await composition.supervisor.stop();
      },
      15_000,
    );

    it(
      "retains request-key idempotency inside the composed command path",
      async () => {
        const composition =
          createRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        composition.recoveryControlService.start();

        const first =
          composition.coordinator.execute({
            command:
              "restart",

            requestKey:
              "composition-idempotent-001",
          });

        const duplicate =
          composition.coordinator.execute({
            command:
              "restart",

            requestKey:
              "composition-idempotent-001",
          });

        expect(duplicate)
          .toBe(
            first,
          );

        const firstResult =
          await first;

        const duplicateResult =
          await duplicate;

        expect(duplicateResult)
          .toBe(
            firstResult,
          );

        expect(
          composition.supervisor.generation,
        ).toBe(
          2,
        );

        await composition.supervisor.stop();
      },
      15_000,
    );
  },
);
