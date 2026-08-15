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
  AutomationDefinitionRepository,
} from "../src/repositories/automation_definition_repository.js";

import {
  AutomationStepRepository,
} from "../src/repositories/automation_step_repository.js";

import {
  AutomationExecutionRepository,
} from "../src/repositories/automation_execution_repository.js";

import {
  AutomationStepExecutionRepository,
} from "../src/repositories/automation_step_execution_repository.js";

describe(
  "automation execution persistence",
  () => {
    const definitions =
      new AutomationDefinitionRepository();

    const steps =
      new AutomationStepRepository();

    const executions =
      new AutomationExecutionRepository();

    const stepExecutions =
      new AutomationStepExecutionRepository();

    afterEach(async () => {
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
    });

    it(
      "persists execution and step state transitions",
      async () => {
        const automation =
          await definitions.create({
            name: "A4.4 execution test",
          });

        const step =
          await steps.create({
            automationId:
              automation.automationId,
            stepOrder: 1,
            stepType: "log",
            name: "Write message",
          });

        const execution =
          await executions.create({
            automationId:
              automation.automationId,
            inputJson:
              JSON.stringify({
                requestId: "test-1",
              }),
          });

        expect(execution.status)
          .toBe("pending");

        const running =
          await executions.transitionStatus(
            execution.publicId,
            "pending",
            "running",
            execution.rowVersion,
          );

        expect(running?.status)
          .toBe("running");

        expect(running?.startedAtUtc)
          .not.toBeNull();

        const stepExecution =
          await stepExecutions.create({
            executionId:
              execution.executionId,
            stepId:
              step.stepId,
            inputJson:
              JSON.stringify({
                message: "hello",
              }),
          });

        expect(stepExecution.status)
          .toBe("pending");

        const stepRunning =
          await stepExecutions.transitionStatus(
            stepExecution.stepExecutionId,
            "pending",
            "running",
          );

        expect(stepRunning?.status)
          .toBe("running");

        const stepSucceeded =
          await stepExecutions.transitionStatus(
            stepExecution.stepExecutionId,
            "running",
            "succeeded",
            JSON.stringify({
              written: true,
            }),
          );

        expect(stepSucceeded?.status)
          .toBe("succeeded");

        expect(
          stepSucceeded?.completedAtUtc,
        ).not.toBeNull();

        const completed =
          await executions.transitionStatus(
            execution.publicId,
            "running",
            "succeeded",
            running!.rowVersion,
            JSON.stringify({
              stepsCompleted: 1,
            }),
          );

        expect(completed?.status)
          .toBe("succeeded");

        expect(
          completed?.completedAtUtc,
        ).not.toBeNull();

        const persistedSteps =
          await stepExecutions
            .listByExecutionId(
              execution.executionId,
            );

        expect(persistedSteps)
          .toHaveLength(1);

        expect(
          persistedSteps[0]?.status,
        ).toBe("succeeded");

        const staleTransition =
          await executions.transitionStatus(
            execution.publicId,
            "running",
            "failed",
            running!.rowVersion,
            null,
            "should not apply",
          );

        expect(staleTransition)
          .toBeNull();
      },
      15_000,
    );
  },
);
