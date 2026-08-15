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
  AutomationTriggerRepository,
} from "../src/repositories/automation_trigger_repository.js";

import {
  AutomationStepRepository,
} from "../src/repositories/automation_step_repository.js";

describe(
  "automation aggregate persistence",
  () => {
    const definitions =
      new AutomationDefinitionRepository();

    const triggers =
      new AutomationTriggerRepository();

    const steps =
      new AutomationStepRepository();

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
      "persists triggers and returns steps in execution order",
      async () => {
        const automation =
          await definitions.create({
            name: "A4.3 aggregate test",
            description:
              "Trigger and ordered-step persistence",
          });

        const trigger =
          await triggers.create({
            automationId:
              automation.automationId,
            triggerType: "manual",
            configurationJson:
              JSON.stringify({
                source: "integration-test",
              }),
          });

        expect(trigger.automationId)
          .toBe(automation.automationId);

        expect(trigger.isEnabled)
          .toBe(true);

        expect(
          JSON.parse(
            trigger.configurationJson,
          ),
        ).toEqual({
          source: "integration-test",
        });

        await steps.create({
          automationId:
            automation.automationId,
          stepOrder: 3,
          stepType: "log",
          name: "Third",
          configurationJson:
            JSON.stringify({
              message: "third",
            }),
        });

        await steps.create({
          automationId:
            automation.automationId,
          stepOrder: 1,
          stepType: "log",
          name: "First",
          configurationJson:
            JSON.stringify({
              message: "first",
            }),
          timeoutSeconds: 30,
        });

        await steps.create({
          automationId:
            automation.automationId,
          stepOrder: 2,
          stepType: "log",
          name: "Second",
        });

        const persistedTriggers =
          await triggers.listByAutomationId(
            automation.automationId,
          );

        expect(persistedTriggers)
          .toHaveLength(1);

        const persistedSteps =
          await steps.listByAutomationId(
            automation.automationId,
          );

        expect(
          persistedSteps.map(
            (step) => step.stepOrder,
          ),
        ).toEqual([1, 2, 3]);

        expect(
          persistedSteps.map(
            (step) => step.name,
          ),
        ).toEqual([
          "First",
          "Second",
          "Third",
        ]);

        expect(
          persistedSteps[0]
            ?.timeoutSeconds,
        ).toBe(30);

        expect(
          persistedSteps[1]
            ?.configurationJson,
        ).toBe("{}");
      },
      15_000,
    );
  },
);
