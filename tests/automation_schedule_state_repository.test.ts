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

describe(
  "AutomationScheduleStateRepository",
  () => {
    const definitions =
      new AutomationDefinitionRepository();

    const triggers =
      new AutomationTriggerRepository();

    const states =
      new AutomationScheduleStateRepository();

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

    async function createAutomation(
      active = true,
    ) {
      const created =
        await definitions.create({
          name: "A6.4 schedule state test",
        });

      if (!active) {
        return created;
      }

      const activated =
        await definitions.updateStatus(
          created.publicId,
          "active",
          created.rowVersion,
        );

      if (!activated) {
        throw new Error(
          "Unable to activate test automation.",
        );
      }

      return activated;
    }

    it(
      "initializes and reads persisted schedule state",
      async () => {
        const automation =
          await createAutomation();

        const trigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 60,
            }),
          });

        const nextFireAtUtc =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const created =
          await states.initialize({
            triggerId: trigger.triggerId,
            nextFireAtUtc,
          });

        expect(created.triggerId)
          .toBe(trigger.triggerId);

        expect(
          created.nextFireAtUtc.toISOString(),
        ).toBe(
          nextFireAtUtc.toISOString(),
        );

        expect(created.lastEvaluatedAtUtc)
          .toBeNull();

        expect(created.rowVersion.length)
          .toBe(8);

        const found =
          await states.getByTriggerId(
            trigger.triggerId,
          );

        expect(found?.scheduleStateId)
          .toBe(created.scheduleStateId);
      },
      20_000,
    );

    it(
      "lists only due active enabled schedule triggers",
      async () => {
        const automation =
          await createAutomation();

        const dueTrigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 60,
            }),
          });

        const futureTrigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 120,
            }),
          });

        const disabledTrigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 60,
            }),
            isEnabled: false,
          });

        const manualTrigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "manual",
          });

        const draftAutomation =
          await createAutomation(false);

        const draftTrigger =
          await triggers.create({
            automationId: draftAutomation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 60,
            }),
          });

        await states.initialize({
          triggerId: dueTrigger.triggerId,
          nextFireAtUtc: new Date(
            "2026-08-15T11:59:00.000Z",
          ),
        });

        await states.initialize({
          triggerId: futureTrigger.triggerId,
          nextFireAtUtc: new Date(
            "2026-08-15T12:01:00.000Z",
          ),
        });

        await states.initialize({
          triggerId: disabledTrigger.triggerId,
          nextFireAtUtc: new Date(
            "2026-08-15T11:58:00.000Z",
          ),
        });

        await states.initialize({
          triggerId: manualTrigger.triggerId,
          nextFireAtUtc: new Date(
            "2026-08-15T11:57:00.000Z",
          ),
        });

        await states.initialize({
          triggerId: draftTrigger.triggerId,
          nextFireAtUtc: new Date(
            "2026-08-15T11:56:00.000Z",
          ),
        });

        const due =
          await states.listDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(due)
          .toHaveLength(1);

        expect(due[0]?.triggerId)
          .toBe(dueTrigger.triggerId);

        expect(due[0]?.automationId)
          .toBe(automation.automationId);

        expect(
          JSON.parse(
            due[0]?.configurationJson ?? "{}",
          ),
        ).toEqual({
          intervalSeconds: 60,
        });
      },
      25_000,
    );

    it(
      "atomically advances state using row-version concurrency",
      async () => {
        const automation =
          await createAutomation();

        const trigger =
          await triggers.create({
            automationId: automation.automationId,
            triggerType: "schedule",
            configurationJson: JSON.stringify({
              intervalSeconds: 60,
            }),
          });

        const initial =
          await states.initialize({
            triggerId: trigger.triggerId,
            nextFireAtUtc: new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          });

        const advanced =
          await states.advance({
            triggerId: trigger.triggerId,
            evaluatedAtUtc: new Date(
              "2026-08-15T12:00:00.000Z",
            ),
            nextFireAtUtc: new Date(
              "2026-08-15T12:01:00.000Z",
            ),
            rowVersion: initial.rowVersion,
          });

        expect(advanced)
          .not.toBeNull();

        expect(
          advanced?.lastEvaluatedAtUtc?.toISOString(),
        ).toBe(
          "2026-08-15T12:00:00.000Z",
        );

        expect(
          advanced?.nextFireAtUtc.toISOString(),
        ).toBe(
          "2026-08-15T12:01:00.000Z",
        );

        expect(
          advanced?.rowVersion.equals(
            initial.rowVersion,
          ),
        ).toBe(false);

        const stale =
          await states.advance({
            triggerId: trigger.triggerId,
            evaluatedAtUtc: new Date(
              "2026-08-15T12:01:00.000Z",
            ),
            nextFireAtUtc: new Date(
              "2026-08-15T12:02:00.000Z",
            ),
            rowVersion: initial.rowVersion,
          });

        expect(stale)
          .toBeNull();
      },
      20_000,
    );

    it(
      "rejects invalid repository scheduling inputs",
      async () => {
        await expect(
          states.listDue(
            new Date(Number.NaN),
          ),
        ).rejects.toThrow(
          "evaluatedAtUtc must be a valid Date.",
        );

        await expect(
          states.listDue(
            new Date(),
            0,
          ),
        ).rejects.toThrow(
          "limit must be an integer from 1 through 1000.",
        );
      },
      15_000,
    );
  },
);
