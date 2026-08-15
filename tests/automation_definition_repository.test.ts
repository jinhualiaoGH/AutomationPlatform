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

describe(
  "AutomationDefinitionRepository",
  () => {
    const repository =
      new AutomationDefinitionRepository();

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
      "creates, reads, lists, and updates status",
      async () => {
        const created =
          await repository.create({
            name: "A4 repository test",
            description:
              "Automation persistence integration test",
          });

        expect(created.publicId)
          .toBeTruthy();

        expect(created.name)
          .toBe("A4 repository test");

        expect(created.status)
          .toBe("draft");

        const found =
          await repository.getByPublicId(
            created.publicId,
          );

        expect(found?.publicId)
          .toBe(created.publicId);

        const listed =
          await repository.list();

        expect(listed)
          .toHaveLength(1);

        const updated =
          await repository.updateStatus(
            created.publicId,
            "active",
            created.rowVersion,
          );

        expect(updated?.status)
          .toBe("active");

        expect(
          updated?.rowVersion.equals(
            created.rowVersion,
          ),
        ).toBe(false);

        const staleUpdate =
          await repository.updateStatus(
            created.publicId,
            "paused",
            created.rowVersion,
          );

        expect(staleUpdate)
          .toBeNull();
      },
      15_000,
    );
  },
);
