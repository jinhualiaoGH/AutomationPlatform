import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerControlAuditRoutes,
} from "../src/routes/scheduler_control_audit.js";

import type {
  SchedulerControlAuditHistory,
} from "../src/operations/scheduler_control_audit_service.js";

import type {
  SchedulerControlAuditHistoryReader,
} from "../src/routes/scheduler_control_audit.js";

class FakeAuditHistory
implements SchedulerControlAuditHistoryReader {
  public limits:
    number[] =
    [];

  public async getRecent(
    limit:
      number,
  ): Promise<SchedulerControlAuditHistory> {
    this.limits.push(
      limit,
    );

    return {
      count:
        1,

      items: [
        {
          auditId:
            "123",

          publicId:
            "11111111-1111-4111-8111-111111111111",

          requestKey:
            "route-1",

          command:
            "stop",

          auditStatus:
            "completed",

          disposition:
            "executed",

          previousState:
            "running",

          currentState:
            "stopped",

          changed:
            true,

          reason:
            null,

          errorMessage:
            null,

          createdAtUtc:
            "2026-08-15T23:00:00.000Z",

          completedAtUtc:
            "2026-08-15T23:00:01.000Z",
        },
      ],
    };
  }
}

const apps:
  ReturnType<typeof Fastify>[] =
  [];

async function buildAuditApp(
  history:
    FakeAuditHistory,
) {
  const app =
    Fastify({
      logger:
        false,
    });

  apps.push(
    app,
  );

  await app.register(
    createSchedulerControlAuditRoutes(
      history,
    ),
  );

  return app;
}

afterEach(
  async () => {
    while (apps.length > 0) {
      const app =
        apps.pop();

      if (app) {
        await app.close();
      }
    }
  },
);

describe(
  "scheduler control audit REST API",
  () => {
    it(
      "returns recent scheduler-control audit history",
      async () => {
        const history =
          new FakeAuditHistory();

        const app =
          await buildAuditApp(
            history,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/commands",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(history.limits)
          .toEqual([
            50,
          ]);

        expect(response.json())
          .toMatchObject({
            count:
              1,

            items: [
              {
                auditId:
                  "123",

                command:
                  "stop",

                auditStatus:
                  "completed",
              },
            ],
          });
      },
    );

    it(
      "accepts an explicit bounded limit",
      async () => {
        const history =
          new FakeAuditHistory();

        const app =
          await buildAuditApp(
            history,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/commands?limit=17",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(history.limits)
          .toEqual([
            17,
          ]);
      },
    );

    it(
      "rejects malformed limits before service access",
      async () => {
        const history =
          new FakeAuditHistory();

        const app =
          await buildAuditApp(
            history,
          );

        for (
          const limit of [
            "0",
            "101",
            "1.5",
            "abc",
            "-1",
          ]
        ) {
          const response =
            await app.inject({
              method:
                "GET",

              url:
                `/operations/scheduler/commands?limit=${limit}`,
            });

          expect(response.statusCode)
            .toBe(400);

          expect(response.json())
            .toEqual({
              error:
                "invalid_scheduler_control_audit_request",

              message:
                "limit must be an integer from 1 to 100.",
            });
        }

        expect(history.limits)
          .toEqual([]);
      },
    );

    it(
      "does not expose mutation methods on the audit history resource",
      async () => {
        const history =
          new FakeAuditHistory();

        const app =
          await buildAuditApp(
            history,
          );

        for (
          const method of [
            "PUT",
            "PATCH",
            "DELETE",
          ] as const
        ) {
          const response =
            await app.inject({
              method,

              url:
                "/operations/scheduler/commands",
            });

          expect(response.statusCode)
            .toBe(404);
        }

        expect(history.limits)
          .toEqual([]);
      },
    );
  },
);
