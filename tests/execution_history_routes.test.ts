import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createExecutionHistoryRoutes,
} from "../src/routes/execution_history.js";

import type {
  ExecutionHistoryResult,
} from "../src/operations/execution_history_service.js";

function historyResult():
  ExecutionHistoryResult {
  return {
    count:
      2,

    items: [
      {
        publicId:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

        automationId:
          10n,

        triggerId:
          20n,

        status:
          "succeeded",

        requestedAtUtc:
          new Date(
            "2026-08-15T16:00:00.000Z",
          ),

        startedAtUtc:
          new Date(
            "2026-08-15T16:00:01.000Z",
          ),

        completedAtUtc:
          new Date(
            "2026-08-15T16:00:03.500Z",
          ),

        durationMilliseconds:
          2500,

        errorMessage:
          null,

        hasFailure:
          false,
      },

      {
        publicId:
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",

        automationId:
          11n,

        triggerId:
          null,

        status:
          "failed",

        requestedAtUtc:
          new Date(
            "2026-08-15T15:00:00.000Z",
          ),

        startedAtUtc:
          new Date(
            "2026-08-15T15:00:01.000Z",
          ),

        completedAtUtc:
          new Date(
            "2026-08-15T15:00:02.000Z",
          ),

        durationMilliseconds:
          1000,

        errorMessage:
          "handler failed",

        hasFailure:
          true,
      },
    ],
  };
}

class FakeHistoryReader {
  public recentCalls:
    number[] =
    [];

  public failureCalls:
    number[] =
    [];

  public automationCalls:
    Array<{
      automationId: bigint;
      limit: number;
    }> = [];

  public recentResult:
    ExecutionHistoryResult =
    historyResult();

  public failureResult:
    ExecutionHistoryResult =
    historyResult();

  public automationResult:
    ExecutionHistoryResult =
    historyResult();

  public recentError:
    unknown =
    null;

  public failureError:
    unknown =
    null;

  public automationError:
    unknown =
    null;

  public async getRecent(
    limit = 50,
  ): Promise<ExecutionHistoryResult> {
    this.recentCalls.push(
      limit,
    );

    if (this.recentError !== null) {
      throw this.recentError;
    }

    return this.recentResult;
  }

  public async getRecentFailures(
    limit = 50,
  ): Promise<ExecutionHistoryResult> {
    this.failureCalls.push(
      limit,
    );

    if (this.failureError !== null) {
      throw this.failureError;
    }

    return this.failureResult;
  }

  public async getRecentForAutomation(
    automationId: bigint,
    limit = 50,
  ): Promise<ExecutionHistoryResult> {
    this.automationCalls.push({
      automationId,
      limit,
    });

    if (this.automationError !== null) {
      throw this.automationError;
    }

    return this.automationResult;
  }
}

const apps:
  ReturnType<typeof Fastify>[] =
  [];

async function buildHistoryApp(
  reader:
    FakeHistoryReader,
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
    createExecutionHistoryRoutes(
      reader,
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
  "execution history REST API",
  () => {
    it(
      "returns recent execution history with HTTP-safe serialization",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions?limit=25",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(reader.recentCalls)
          .toEqual([
            25,
          ]);

        expect(response.json())
          .toEqual({
            count:
              2,

            items: [
              {
                publicId:
                  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

                automationId:
                  "10",

                triggerId:
                  "20",

                status:
                  "succeeded",

                requestedAtUtc:
                  "2026-08-15T16:00:00.000Z",

                startedAtUtc:
                  "2026-08-15T16:00:01.000Z",

                completedAtUtc:
                  "2026-08-15T16:00:03.500Z",

                durationMilliseconds:
                  2500,

                errorMessage:
                  null,

                hasFailure:
                  false,
              },

              {
                publicId:
                  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",

                automationId:
                  "11",

                triggerId:
                  null,

                status:
                  "failed",

                requestedAtUtc:
                  "2026-08-15T15:00:00.000Z",

                startedAtUtc:
                  "2026-08-15T15:00:01.000Z",

                completedAtUtc:
                  "2026-08-15T15:00:02.000Z",

                durationMilliseconds:
                  1000,

                errorMessage:
                  "handler failed",

                hasFailure:
                  true,
              },
            ],
          });
      },
    );

    it(
      "uses the default bounded history limit",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(reader.recentCalls)
          .toEqual([
            50,
          ]);
      },
    );

    it(
      "returns recent failures through the dedicated endpoint",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions/failures?limit=12",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(reader.failureCalls)
          .toEqual([
            12,
          ]);
      },
    );

    it(
      "returns automation-scoped execution history",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/automations/77/executions?limit=9",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(reader.automationCalls)
          .toEqual([
            {
              automationId:
                77n,

              limit:
                9,
            },
          ]);
      },
    );

    it(
      "rejects malformed and out-of-range limits before service invocation",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        for (
          const limit of [
            "0",
            "201",
            "-1",
            "1.5",
            "abc",
          ]
        ) {
          const response =
            await app.inject({
              method:
                "GET",

              url:
                "/operations/executions?limit=" +
                encodeURIComponent(
                  limit,
                ),
            });

          expect(response.statusCode)
            .toBe(400);

          expect(response.json())
            .toEqual({
              error:
                "invalid_execution_history_request",

              message:
                "limit must be an integer from 1 through 200.",
            });
        }

        expect(reader.recentCalls)
          .toEqual([]);
      },
    );

    it(
      "rejects invalid automation identifiers before service invocation",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        for (
          const automationId of [
            "0",
            "-1",
            "abc",
          ]
        ) {
          const response =
            await app.inject({
              method:
                "GET",

              url:
                "/operations/automations/" +
                automationId +
                "/executions",
            });

          expect(response.statusCode)
            .toBe(400);

          expect(response.json())
            .toEqual({
              error:
                "invalid_execution_history_request",

              message:
                "automationId must be a positive integer.",
            });
        }

        expect(reader.automationCalls)
          .toEqual([]);
      },
    );

    it(
      "preserves incomplete timestamp and duration null semantics",
      async () => {
        const reader =
          new FakeHistoryReader();

        reader.recentResult = {
          count:
            1,

          items: [
            {
              publicId:
                "cccccccc-cccc-4ccc-8ccc-cccccccccccc",

              automationId:
                15n,

              triggerId:
                null,

              status:
                "running",

              requestedAtUtc:
                new Date(
                  "2026-08-15T17:00:00.000Z",
                ),

              startedAtUtc:
                new Date(
                  "2026-08-15T17:00:01.000Z",
                ),

              completedAtUtc:
                null,

              durationMilliseconds:
                null,

              errorMessage:
                null,

              hasFailure:
                false,
            },
          ],
        };

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(response.statusCode)
          .toBe(200);

        const item =
          response.json()
            .items[0];

        expect(item.completedAtUtc)
          .toBeNull();

        expect(item.durationMilliseconds)
          .toBeNull();
      },
    );

    it(
      "returns a stable 500 response when history observation fails",
      async () => {
        const reader =
          new FakeHistoryReader();

        reader.recentError =
          new Error(
            "synthetic history failure",
          );

        const app =
          await buildHistoryApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(response.statusCode)
          .toBe(500);

        expect(response.json())
          .toEqual({
            error:
              "execution_history_error",

            message:
              "Unable to read execution history.",
          });
      },
    );

    it(
      "does not expose mutation methods on operational history endpoints",
      async () => {
        const reader =
          new FakeHistoryReader();

        const app =
          await buildHistoryApp(
            reader,
          );

        for (
          const method of [
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
          ] as const
        ) {
          const response =
            await app.inject({
              method,

              url:
                "/operations/executions",
            });

          expect(response.statusCode)
            .toBe(404);
        }

        expect(reader.recentCalls)
          .toEqual([]);
      },
    );
  },
);
