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

import type {
  AutomationExecution,
} from "../src/domain/automation.js";

import {
  AutomationDefinitionRepository,
} from "../src/repositories/automation_definition_repository.js";

import {
  AutomationExecutionRepository,
} from "../src/repositories/automation_execution_repository.js";

import {
  AutomationStepExecutionRepository,
} from "../src/repositories/automation_step_execution_repository.js";

import {
  AutomationStepRepository,
} from "../src/repositories/automation_step_repository.js";

import {
  HandlerRegistry,
  UnknownStepHandlerError,
} from "../src/runtime/handler_registry.js";

import {
  PersistentStepRunner,
} from "../src/runtime/persistent_step_runner.js";

import {
  StepExecutionEngine,
} from "../src/runtime/step_execution_engine.js";

import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../src/runtime/step_handler.js";

class ExplicitFailureHandler
  implements StepHandler {
  public readonly stepType =
    "test.failure";

  public async execute(
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    return {
      status: "failed",

      outputJson:
        JSON.stringify({
          partial: true,
        }),

      errorMessage:
        "Synthetic persistent failure.",
    };
  }
}

describe(
  "PersistentStepRunner",
  () => {
    const definitions =
      new AutomationDefinitionRepository();

    const steps =
      new AutomationStepRepository();

    const executions =
      new AutomationExecutionRepository();

    const stepExecutions =
      new AutomationStepExecutionRepository();

    afterEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool.request().query(`
          DELETE FROM dbo.automation_step_execution;
          DELETE FROM dbo.automation_execution;
          DELETE FROM dbo.automation_step;
          DELETE FROM dbo.automation_trigger;
          DELETE FROM dbo.automation_definition;
        `);

        await closeDatabase();
      },
      15_000,
    );

    async function createRunningExecution():
      Promise<AutomationExecution> {
      const automation =
        await definitions.create({
          name:
            "A5.6 persistent runner test",
        });

      const execution =
        await executions.create({
          automationId:
            automation.automationId,
        });

      const running =
        await executions.transitionStatus(
          execution.publicId,
          "pending",
          "running",
          execution.rowVersion,
        );

      if (!running) {
        throw new Error(
          "Unable to start test automation execution.",
        );
      }

      return running;
    }

    it(
      "persists a successful built-in log step",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType: "log",

            name:
              "Persistent log step",
          });

        const runner =
          new PersistentStepRunner();

        const completed =
          await runner.run({
            automationExecution:
              running,

            step,

            attemptNumber: 2,

            inputJson:
              JSON.stringify({
                message: "hello",
              }),
          });

        expect(completed.status)
          .toBe("succeeded");

        expect(
          completed.attemptNumber,
        ).toBe(2);

        expect(
          completed.startedAtUtc,
        ).not.toBeNull();

        expect(
          completed.completedAtUtc,
        ).not.toBeNull();

        expect(
          JSON.parse(
            completed.inputJson ??
              "{}",
          ),
        ).toEqual({
          message: "hello",
        });

        expect(
          JSON.parse(
            completed.outputJson ??
              "{}",
          ),
        ).toEqual({
          kind: "log",
          stepType: "log",

          executionId:
            running
              .executionId
              .toString(),

          stepId:
            step.stepId
              .toString(),

          attemptNumber: 2,
        });

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(persisted)
          .toHaveLength(1);

        expect(
          persisted[0]?.status,
        ).toBe("succeeded");
      },
      20_000,
    );

    it(
      "persists an explicit handler failure",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "test.failure",

            name:
              "Persistent failing step",
          });

        const registry =
          new HandlerRegistry();

        registry.register(
          new ExplicitFailureHandler(),
        );

        const runner =
          new PersistentStepRunner(
            new StepExecutionEngine(
              registry,
            ),
          );

        const completed =
          await runner.run({
            automationExecution:
              running,

            step,
          });

        expect(completed.status)
          .toBe("failed");

        expect(
          completed.errorMessage,
        ).toBe(
          "Synthetic persistent failure.",
        );

        expect(
          JSON.parse(
            completed.outputJson ??
              "{}",
          ),
        ).toEqual({
          partial: true,
        });
      },
      20_000,
    );

    it(
      "persists an unknown handler failure and preserves the registry error",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "missing.handler",

            name:
              "Missing handler step",
          });

        const runner =
          new PersistentStepRunner();

        await expect(
          runner.run({
            automationExecution:
              running,

            step,
          }),
        ).rejects.toBeInstanceOf(
          UnknownStepHandlerError,
        );

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(persisted)
          .toHaveLength(1);

        expect(
          persisted[0]?.status,
        ).toBe("failed");

        expect(
          persisted[0]?.errorMessage,
        ).toContain(
          "missing.handler",
        );

        expect(
          persisted[0]?.completedAtUtc,
        ).not.toBeNull();
      },
      20_000,
    );

    it(
      "rejects a step when the automation execution is not running",
      async () => {
        const automation =
          await definitions.create({
            name:
              "A5.6 pending execution test",
          });

        const step =
          await steps.create({
            automationId:
              automation.automationId,

            stepOrder: 1,

            stepType: "log",

            name:
              "Should not run",
          });

        const pending =
          await executions.create({
            automationId:
              automation.automationId,
          });

        const runner =
          new PersistentStepRunner();

        await expect(
          runner.run({
            automationExecution:
              pending,

            step,
          }),
        ).rejects.toThrow(
          "requires a running automation execution",
        );

        const persisted =
          await stepExecutions
            .listByExecutionId(
              pending.executionId,
            );

        expect(persisted)
          .toHaveLength(0);
      },
      20_000,
    );

    it(
      "rejects an invalid attempt number before persistence",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType: "log",

            name:
              "Invalid attempt",
          });

        const runner =
          new PersistentStepRunner();

        await expect(
          runner.run({
            automationExecution:
              running,

            step,

            attemptNumber: 0,
          }),
        ).rejects.toThrow(
          "positive integer",
        );

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(persisted)
          .toHaveLength(0);
      },
      20_000,
    );
  },
);
