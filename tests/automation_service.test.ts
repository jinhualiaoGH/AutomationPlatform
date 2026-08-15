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
  AutomationService,
} from "../src/services/automation_service.js";

describe(
  "AutomationService",
  () => {
    const service =
      new AutomationService();

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
      "enforces automation and execution lifecycle rules",
      async () => {
        const created =
          await service.createAutomation(
            "  Service automation  ",
            "  lifecycle test  ",
          );

        expect(created.name)
          .toBe("Service automation");

        expect(created.description)
          .toBe("lifecycle test");

        expect(created.status)
          .toBe("draft");

        await expect(
          service.startExecution(
            created.publicId,
          ),
        ).rejects.toThrow(
          "Only active automations can be executed.",
        );

        const active =
          await service
            .changeAutomationStatus(
              created.publicId,
              "active",
              created.rowVersion,
            );

        expect(active.status)
          .toBe("active");

        const running =
          await service.startExecution(
            active.publicId,
            {
              requestId: "service-test",
            },
          );

        expect(running.status)
          .toBe("running");

        expect(running.startedAtUtc)
          .not.toBeNull();

        const succeeded =
          await service.completeExecution(
            running,
            {
              processed: true,
            },
          );

        expect(succeeded.status)
          .toBe("succeeded");

        expect(
          succeeded.completedAtUtc,
        ).not.toBeNull();

        expect(
          JSON.parse(
            succeeded.outputJson ?? "{}",
          ),
        ).toEqual({
          processed: true,
        });

        await expect(
          service.changeAutomationStatus(
            active.publicId,
            "draft",
            active.rowVersion,
          ),
        ).rejects.toThrow(
          "Invalid automation status transition",
        );
      },
      15_000,
    );

    it(
      "records failed execution state",
      async () => {
        const created =
          await service.createAutomation(
            "Failure test",
          );

        const active =
          await service
            .changeAutomationStatus(
              created.publicId,
              "active",
              created.rowVersion,
            );

        const running =
          await service.startExecution(
            active.publicId,
          );

        const failed =
          await service.failExecution(
            running,
            "Synthetic failure",
          );

        expect(failed.status)
          .toBe("failed");

        expect(failed.errorMessage)
          .toBe("Synthetic failure");

        expect(failed.completedAtUtc)
          .not.toBeNull();
      },
      15_000,
    );
  },
);
