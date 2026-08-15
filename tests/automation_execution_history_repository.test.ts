import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
  AutomationExecutionHistoryRepository,
  maximumExecutionHistoryLimit,
} from "../src/repositories/automation_execution_history_repository.js";

async function clearAutomationData():
  Promise<void> {
  const pool =
    await getDatabasePool();

  await pool.request().query(`
    DELETE FROM dbo.automation_step_execution;
    DELETE FROM dbo.automation_execution;
    DELETE FROM dbo.automation_step;
    DELETE FROM dbo.automation_trigger;
    DELETE FROM dbo.automation_schedule_state;
    DELETE FROM dbo.automation_definition;
  `);
}

describe(
  "AutomationExecutionHistoryRepository",
  () => {
    beforeAll(
      async () => {
        await getDatabasePool();
      },
      15_000,
    );

    beforeEach(
      async () => {
        await clearAutomationData();
      },
    );

    afterEach(
      async () => {
        await clearAutomationData();
      },
    );

    afterAll(
      async () => {
        await closeDatabase();
      },
    );

    it(
      "returns newest executions first and exposes failed execution detail",
      async () => {
        const definitions =
          new AutomationDefinitionRepository();

        const executions =
          new AutomationExecutionRepository();

        const history =
          new AutomationExecutionHistoryRepository();

        const definition =
          await definitions.create({
            name:
              "A7.5 history repository " +
              Date.now(),
          });

        const first =
          await executions.create({
            automationId:
              definition.automationId,
          });

        const failed =
          await executions.transitionStatus(
            first.publicId,
            "pending",
            "failed",
            first.rowVersion,
            null,
            "A7.5 synthetic failure",
          );

        expect(failed)
          .not.toBeNull();

        const second =
          await executions.create({
            automationId:
              definition.automationId,
          });

        const recent =
          await history
            .listRecentByAutomationId(
              definition.automationId,
              10,
            );

        expect(recent.length)
          .toBeGreaterThanOrEqual(2);

        expect(recent[0]?.publicId)
          .toBe(
            second.publicId,
          );

        const matchingFailure =
          recent.find(
            (item) =>
              item.publicId ===
              first.publicId,
          );

        expect(matchingFailure?.status)
          .toBe(
            "failed",
          );

        expect(
          matchingFailure?.errorMessage,
        ).toBe(
          "A7.5 synthetic failure",
        );

        const failures =
          await history
            .listRecentFailures(
              maximumExecutionHistoryLimit,
            );

        expect(
          failures.some(
            (item) =>
              item.publicId ===
              first.publicId &&
              item.status === "failed" &&
              item.errorMessage ===
                "A7.5 synthetic failure",
          ),
        ).toBe(true);
      },
      20_000,
    );

    it(
      "rejects invalid bounded-query inputs",
      async () => {
        const history =
          new AutomationExecutionHistoryRepository();

        await expect(
          history.listRecent(
            0,
          ),
        ).rejects.toThrow(
          "Execution history limit must be an integer from 1 through",
        );

        await expect(
          history.listRecent(
            maximumExecutionHistoryLimit +
              1,
          ),
        ).rejects.toThrow(
          "Execution history limit must be an integer from 1 through",
        );

        await expect(
          history
            .listRecentByAutomationId(
              0n,
              10,
            ),
        ).rejects.toThrow(
          "automationId must be positive.",
        );
      },
    );
  },
);
