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
  AutomationExecutionRepository,
} from "../src/repositories/automation_execution_repository.js";

import {
  AutomationStepExecutionRepository,
} from "../src/repositories/automation_step_execution_repository.js";

import {
  AutomationStepRepository,
} from "../src/repositories/automation_step_repository.js";

import {
  AutomationService,
} from "../src/services/automation_service.js";

import {
  AutomationExecutionRunner,
} from "../src/runtime/automation_execution_runner.js";

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

class OrderedProbeHandler
  implements StepHandler {
  public readonly stepType =
    "test.ordered";

  public readonly observedStepOrders:
    number[] = [];

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.observedStepOrders.push(
      context.step.stepOrder,
    );

    return {
      status: "succeeded",

      outputJson:
        JSON.stringify({
          stepOrder:
            context.step.stepOrder,
        }),
    };
  }
}

class FailOnSecondHandler
  implements StepHandler {
  public readonly stepType =
    "test.stop";

  public readonly observedStepOrders:
    number[] = [];

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    this.observedStepOrders.push(
      context.step.stepOrder,
    );

    if (
      context.step.stepOrder === 2
    ) {
      return {
        status: "failed",

        errorMessage:
          "Synthetic ordered failure.",
      };
    }

    return {
      status: "succeeded",
    };
  }
}

describe(
  "AutomationExecutionRunner",
  () => {
    const definitions =
      new AutomationDefinitionRepository();

    const steps =
      new AutomationStepRepository();

    const executions =
      new AutomationExecutionRepository();

    const stepExecutions =
      new AutomationStepExecutionRepository();

    const service =
      new AutomationService();

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

    async function createActiveAutomation(
      name: string,
    ) {
      const created =
        await definitions.create({
          name,
        });

      const active =
        await definitions.updateStatus(
          created.publicId,
          "active",
          created.rowVersion,
        );

      if (!active) {
        throw new Error(
          "Unable to activate test automation.",
        );
      }

      return active;
    }

    it(
      "executes persisted steps in step order and succeeds the parent execution",
      async () => {
        const automation =
          await createActiveAutomation(
            "A5.7 ordered success",
          );

        /*
         * Deliberately create out of order.
         * Repository ordering, not insertion order,
         * must control execution.
         */

        await steps.create({
          automationId:
            automation.automationId,

          stepOrder: 3,

          stepType:
            "test.ordered",

          name:
            "Third",
        });

        await steps.create({
          automationId:
            automation.automationId,

          stepOrder: 1,

          stepType:
            "test.ordered",

          name:
            "First",
        });

        await steps.create({
          automationId:
            automation.automationId,

          stepOrder: 2,

          stepType:
            "test.ordered",

          name:
            "Second",
        });

        const handler =
          new OrderedProbeHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const runner =
          new AutomationExecutionRunner(
            service,

            steps,

            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),
          );

        const result =
          await runner.run(
            automation.publicId,
            {
              requestId:
                "ordered-success",
            },
          );

        expect(
          handler.observedStepOrders,
        ).toEqual([
          1,
          2,
          3,
        ]);

        expect(
          result.stepExecutions,
        ).toHaveLength(3);

        expect(
          result.stepExecutions.map(
            (stepExecution) =>
              stepExecution.status,
          ),
        ).toEqual([
          "succeeded",
          "succeeded",
          "succeeded",
        ]);

        expect(
          result.execution.status,
        ).toBe("succeeded");

        expect(
          result.execution.completedAtUtc,
        ).not.toBeNull();

        expect(
          JSON.parse(
            result.execution.outputJson ??
              "{}",
          ),
        ).toEqual({
          stepsCompleted: 3,
        });

        const persisted =
          await stepExecutions
            .listByExecutionId(
              result.execution.executionId,
            );

        expect(persisted)
          .toHaveLength(3);
      },
      25_000,
    );

    it(
      "stops after the first failed step and fails the parent execution",
      async () => {
        const automation =
          await createActiveAutomation(
            "A5.7 ordered failure",
          );

        for (
          const stepOrder of [
            1,
            2,
            3,
          ]
        ) {
          await steps.create({
            automationId:
              automation.automationId,

            stepOrder,

            stepType:
              "test.stop",

            name:
              `Step ${stepOrder}`,
          });
        }

        const handler =
          new FailOnSecondHandler();

        const registry =
          new HandlerRegistry();

        registry.register(
          handler,
        );

        const runner =
          new AutomationExecutionRunner(
            service,

            steps,

            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),
          );

        const result =
          await runner.run(
            automation.publicId,
          );

        expect(
          handler.observedStepOrders,
        ).toEqual([
          1,
          2,
        ]);

        expect(
          result.stepExecutions,
        ).toHaveLength(2);

        expect(
          result.stepExecutions[0]?.status,
        ).toBe("succeeded");

        expect(
          result.stepExecutions[1]?.status,
        ).toBe("failed");

        expect(
          result.execution.status,
        ).toBe("failed");

        expect(
          result.execution.errorMessage,
        ).toBe(
          "Synthetic ordered failure.",
        );

        const persisted =
          await stepExecutions
            .listByExecutionId(
              result.execution.executionId,
            );

        expect(persisted)
          .toHaveLength(2);
      },
      25_000,
    );

    it(
      "succeeds an automation with zero steps",
      async () => {
        const automation =
          await createActiveAutomation(
            "A5.7 zero steps",
          );

        const runner =
          new AutomationExecutionRunner();

        const result =
          await runner.run(
            automation.publicId,
          );

        expect(
          result.stepExecutions,
        ).toEqual([]);

        expect(
          result.execution.status,
        ).toBe("succeeded");

        expect(
          JSON.parse(
            result.execution.outputJson ??
              "{}",
          ),
        ).toEqual({
          stepsCompleted: 0,
        });
      },
      20_000,
    );

    it(
      "persists parent failure when runtime composition throws",
      async () => {
        const automation =
          await createActiveAutomation(
            "A5.7 unknown handler",
          );

        await steps.create({
          automationId:
            automation.automationId,

          stepOrder: 1,

          stepType:
            "missing.handler",

          name:
            "Missing handler",
        });

        const registry =
          new HandlerRegistry();

        const runner =
          new AutomationExecutionRunner(
            service,

            steps,

            new PersistentStepRunner(
              new StepExecutionEngine(
                registry,
              ),
            ),
          );

        let executionPublicId:
          string | undefined;

        try {
          await runner.run(
            automation.publicId,
          );
        }
        catch (error) {
          expect(error)
            .toBeInstanceOf(
              UnknownStepHandlerError,
            );
        }

        const pool =
          await getDatabasePool();

        const result =
          await pool.request().query<{
            public_id: string;
          }>(`
            SELECT TOP (1)
                public_id
            FROM dbo.automation_execution
            WHERE automation_id =
                ${automation.automationId.toString()}
            ORDER BY execution_id DESC;
          `);

        executionPublicId =
          result.recordset[0]
            ?.public_id;

        expect(executionPublicId)
          .toBeTruthy();

        const persistedExecution =
          await executions.getByPublicId(
            executionPublicId!,
          );

        expect(
          persistedExecution?.status,
        ).toBe("failed");

        expect(
          persistedExecution
            ?.errorMessage,
        ).toContain(
          "missing.handler",
        );

        const persistedAttempts =
          await stepExecutions
            .listByExecutionId(
              persistedExecution!
                .executionId,
            );

        expect(persistedAttempts)
          .toHaveLength(1);

        expect(
          persistedAttempts[0]
            ?.status,
        ).toBe("failed");
      },
      25_000,
    );

    it(
      "rejects execution of a non-active automation before creating a parent execution",
      async () => {
        const automation =
          await definitions.create({
            name:
              "A5.7 inactive automation",
          });

        const runner =
          new AutomationExecutionRunner();

        await expect(
          runner.run(
            automation.publicId,
          ),
        ).rejects.toThrow(
          "Only active automations can be executed.",
        );

        const pool =
          await getDatabasePool();

        const result =
          await pool.request().query<{
            execution_count: number;
          }>(`
            SELECT
                COUNT(*) AS execution_count
            FROM dbo.automation_execution
            WHERE automation_id =
                ${automation.automationId.toString()};
          `);

        expect(
          result.recordset[0]
            ?.execution_count,
        ).toBe(0);
      },
      20_000,
    );
  },
);
