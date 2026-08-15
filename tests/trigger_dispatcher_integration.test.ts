import sql from "mssql";

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
  AutomationScheduleStateRepository,
} from "../src/repositories/automation_schedule_state_repository.js";

import {
  AutomationTriggerRepository,
} from "../src/repositories/automation_trigger_repository.js";

import {
  TriggerDispatcher,
} from "../src/scheduling/trigger_dispatcher.js";

describe(
  "TriggerDispatcher integration",
  () => {
    afterEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool.request().query(`
          DELETE FROM dbo.automation_schedule_state;
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

    it(
      "advances a due schedule and persists a trigger-attributed execution",
      async () => {
        const definitions =
          new AutomationDefinitionRepository();

        const triggers =
          new AutomationTriggerRepository();

        const states =
          new AutomationScheduleStateRepository();

        const draft =
          await definitions.create({
            name:
              "A6.5 dispatcher integration",
          });

        const active =
          await definitions.updateStatus(
            draft.publicId,
            "active",
            draft.rowVersion,
          );

        if (!active) {
          throw new Error(
            "Unable to activate test automation.",
          );
        }

        const trigger =
          await triggers.create({
            automationId:
              active.automationId,

            triggerType:
              "schedule",

            configurationJson:
              JSON.stringify({
                intervalSeconds: 60,
              }),
          });

        await states.initialize({
          triggerId:
            trigger.triggerId,

          nextFireAtUtc:
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
        });

        const dispatcher =
          new TriggerDispatcher();

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(summary.dispatched)
          .toBe(1);

        expect(summary.failed)
          .toBe(0);

        const advanced =
          await states.getByTriggerId(
            trigger.triggerId,
          );

        expect(
          advanced
            ?.nextFireAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-15T12:01:00.000Z",
        );

        expect(
          advanced
            ?.lastEvaluatedAtUtc
            ?.toISOString(),
        ).toBe(
          "2026-08-15T12:00:00.000Z",
        );

        const pool =
          await getDatabasePool();

        const result =
          await pool
            .request()
            .input(
              "triggerId",
              sql.BigInt,
              trigger.triggerId,
            )
            .query<{
              trigger_id: bigint;
              status: string;
              input_json: string | null;
            }>(`
              SELECT
                  trigger_id,
                  status,
                  input_json
              FROM dbo.automation_execution
              WHERE trigger_id =
                  @triggerId;
            `);

        expect(result.recordset)
          .toHaveLength(1);

        const execution =
          result.recordset[0];

        expect(
          execution?.trigger_id,
        ).toBe(
          trigger.triggerId,
        );

        expect(
          execution?.status,
        ).toBe(
          "succeeded",
        );

        const input =
          JSON.parse(
            execution?.input_json ??
            "{}",
          );

        expect(
          input.schedule
            .scheduledForUtc,
        ).toBe(
          "2026-08-15T12:00:00.000Z",
        );

        expect(
          input.schedule
            .evaluatedAtUtc,
        ).toBe(
          "2026-08-15T12:00:00.000Z",
        );
      },
      25_000,
    );
  },
);
