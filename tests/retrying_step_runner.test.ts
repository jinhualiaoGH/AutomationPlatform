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
  BoundedStepRetryPolicy,
} from "../src/runtime/retry_policy.js";

import {
  RetryingStepRunner,
} from "../src/runtime/retrying_step_runner.js";

import {
  StepExecutionEngine,
} from "../src/runtime/step_execution_engine.js";

import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../src/runtime/step_handler.js";

class FailTwiceThenSucceedHandler
  implements StepHandler {
  public readonly stepType =
    "test.retry-success";

  public readonly attempts:
    number[] = [];

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.attempts.push(
      context.attemptNumber,
    );

    if (
      this.attempts.length < 3
    ) {
      return {
        status: "failed",

        errorMessage:
          `Synthetic failure ${this.attempts.length}.`,
      };
    }

    return {
      status: "succeeded",

      outputJson:
        JSON.stringify({
          attemptNumber:
            context.attemptNumber,
        }),
    };
  }
}

class AlwaysFailHandler
  implements StepHandler {
  public readonly stepType =
    "test.retry-fail";

  public readonly attempts:
    number[] = [];

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.attempts.push(
      context.attemptNumber,
    );

    return {
      status: "failed",

      errorMessage:
        `Failure at attempt ${context.attemptNumber}.`,
    };
  }
}

describe(
  "RetryingStepRunner",
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
            "A5.8 retry test",
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
          "Unable to start retry test execution.",
        );
      }

      return running;
    }

    it(
      "retries failed attempts until a later attempt succeeds",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "test.retry-success",

            name:
              "Retry until success",
          });

        const handler =
          new FailTwiceThenSucceedHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const attemptRunner =
          new PersistentStepRunner(
            new StepExecutionEngine(
              registry,
            ),
          );

        const retryRunner =
          new RetryingStepRunner(
            attemptRunner,

            new BoundedStepRetryPolicy(
              3,
            ),
          );

        const finalAttempt =
          await retryRunner.run({
            automationExecution:
              running,

            step,
          });

        expect(
          handler.attempts,
        ).toEqual([
          1,
          2,
          3,
        ]);

        expect(
          finalAttempt.status,
        ).toBe("succeeded");

        expect(
          finalAttempt.attemptNumber,
        ).toBe(3);

        expect(
          JSON.parse(
            finalAttempt.outputJson ??
              "{}",
          ),
        ).toEqual({
          attemptNumber: 3,
        });

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(
          persisted.map(
            (attempt) =>
              attempt.attemptNumber,
          ),
        ).toEqual([
          1,
          2,
          3,
        ]);

        expect(
          persisted.map(
            (attempt) =>
              attempt.status,
          ),
        ).toEqual([
          "failed",
          "failed",
          "succeeded",
        ]);
      },
      25_000,
    );

    it(
      "stops after maxAttempts is exhausted",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "test.retry-fail",

            name:
              "Retry exhaustion",
          });

        const handler =
          new AlwaysFailHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const retryRunner =
          new RetryingStepRunner(
            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),

            new BoundedStepRetryPolicy(
              3,
            ),
          );

        const finalAttempt =
          await retryRunner.run({
            automationExecution:
              running,

            step,
          });

        expect(
          handler.attempts,
        ).toEqual([
          1,
          2,
          3,
        ]);

        expect(
          finalAttempt.status,
        ).toBe("failed");

        expect(
          finalAttempt.attemptNumber,
        ).toBe(3);

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(persisted)
          .toHaveLength(3);

        expect(
          persisted.every(
            (attempt) =>
              attempt.status ===
              "failed",
          ),
        ).toBe(true);
      },
      25_000,
    );

    it(
      "honors an explicit non-retryable policy decision",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "test.retry-fail",

            name:
              "Non-retryable failure",
          });

        const handler =
          new AlwaysFailHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const retryRunner =
          new RetryingStepRunner(
            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),

            new BoundedStepRetryPolicy(
              5,
              () => false,
            ),
          );

        const finalAttempt =
          await retryRunner.run({
            automationExecution:
              running,

            step,
          });

        expect(
          handler.attempts,
        ).toEqual([
          1,
        ]);

        expect(
          finalAttempt.status,
        ).toBe("failed");

        expect(
          finalAttempt.attemptNumber,
        ).toBe(1);

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(persisted)
          .toHaveLength(1);
      },
      25_000,
    );

    it(
      "never retries a thrown runtime composition error",
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
              "Unknown retry handler",
          });

        const retryRunner =
          new RetryingStepRunner(
            new PersistentStepRunner(
              new StepExecutionEngine(
                new HandlerRegistry(),
              ),
            ),

            new BoundedStepRetryPolicy(
              5,
            ),
          );

        await expect(
          retryRunner.run({
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
          persisted[0]
            ?.attemptNumber,
        ).toBe(1);

        expect(
          persisted[0]
            ?.status,
        ).toBe("failed");
      },
      25_000,
    );

    it(
      "increments from a caller-supplied starting attempt number",
      async () => {
        const running =
          await createRunningExecution();

        const step =
          await steps.create({
            automationId:
              running.automationId,

            stepOrder: 1,

            stepType:
              "test.retry-fail",

            name:
              "Offset retry numbering",
          });

        const handler =
          new AlwaysFailHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const retryRunner =
          new RetryingStepRunner(
            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),

            new BoundedStepRetryPolicy(
              2,
            ),
          );

        const finalAttempt =
          await retryRunner.run({
            automationExecution:
              running,

            step,

            attemptNumber: 4,
          });

        expect(
          handler.attempts,
        ).toEqual([
          4,
          5,
        ]);

        expect(
          finalAttempt.attemptNumber,
        ).toBe(5);

        const persisted =
          await stepExecutions
            .listByExecutionId(
              running.executionId,
            );

        expect(
          persisted.map(
            (attempt) =>
              attempt.attemptNumber,
          ),
        ).toEqual([
          4,
          5,
        ]);
      },
      25_000,
    );
  },
);
