import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildApp,
} from "../src/app.js";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

describe(
  "automation REST API",
  () => {
    const applications:
      ReturnType<typeof buildApp>[] = [];

    afterEach(async () => {
      await Promise.all(
        applications.map(
          (app) =>
            app.close(),
        ),
      );

      applications.length = 0;

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
      "creates, reads, and activates an automation",
      async () => {
        const app =
          buildApp();

        applications.push(app);

        const createResponse =
          await app.inject({
            method: "POST",
            url: "/automations",

            payload: {
              name:
                "  API automation  ",

              description:
                "  REST integration test  ",
            },
          });

        expect(
          createResponse.statusCode,
        ).toBe(201);

        const created =
          createResponse.json();

        expect(created.name)
          .toBe(
            "API automation",
          );

        expect(created.description)
          .toBe(
            "REST integration test",
          );

        expect(created.status)
          .toBe("draft");

        expect(created.publicId)
          .toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );

        expect(created.rowVersion)
          .toBeTruthy();

        expect(
          created.automationId,
        ).toBeUndefined();

        const getResponse =
          await app.inject({
            method: "GET",

            url:
              `/automations/${created.publicId}`,
          });

        expect(
          getResponse.statusCode,
        ).toBe(200);

        const found =
          getResponse.json();

        expect(found.publicId)
          .toBe(
            created.publicId,
          );

        expect(found.status)
          .toBe("draft");

        const statusResponse =
          await app.inject({
            method: "PATCH",

            url:
              `/automations/${created.publicId}/status`,

            payload: {
              status:
                "active",

              rowVersion:
                created.rowVersion,
            },
          });

        expect(
          statusResponse.statusCode,
        ).toBe(200);

        const active =
          statusResponse.json();

        expect(active.status)
          .toBe("active");

        expect(
          active.rowVersion,
        ).not.toBe(
          created.rowVersion,
        );
      },
      20_000,
    );

    it(
      "rejects invalid input and stale row versions",
      async () => {
        const app =
          buildApp();

        applications.push(app);

        const invalidCreate =
          await app.inject({
            method: "POST",
            url: "/automations",

            payload: {
              name: "   ",
            },
          });

        expect(
          invalidCreate.statusCode,
        ).toBe(400);

        const createdResponse =
          await app.inject({
            method: "POST",
            url: "/automations",

            payload: {
              name:
                "Conflict test",
            },
          });

        expect(
          createdResponse.statusCode,
        ).toBe(201);

        const created =
          createdResponse.json();

        const activation =
          await app.inject({
            method: "PATCH",

            url:
              `/automations/${created.publicId}/status`,

            payload: {
              status:
                "active",

              rowVersion:
                created.rowVersion,
            },
          });

        expect(
          activation.statusCode,
        ).toBe(200);

        const staleUpdate =
          await app.inject({
            method: "PATCH",

            url:
              `/automations/${created.publicId}/status`,

            payload: {
              status:
                "paused",

              rowVersion:
                created.rowVersion,
            },
          });

        expect(
          staleUpdate.statusCode,
        ).toBe(409);

        const staleBody =
          staleUpdate.json();

        expect(staleBody.error)
          .toBe("conflict");

        const missing =
          await app.inject({
            method: "GET",

            url:
              "/automations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          });

        expect(
          missing.statusCode,
        ).toBe(404);

        const malformed =
          await app.inject({
            method: "GET",

            url:
              "/automations/not-a-uuid",
          });

        expect(
          malformed.statusCode,
        ).toBe(400);
      },
      20_000,
    );
  },
);
