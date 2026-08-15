import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AutomationExecution,
} from "../src/domain/automation.js";

import {
  ExecutionHistoryService,
} from "../src/operations/execution_history_service.js";

function execution(
  overrides:
    Partial<AutomationExecution> =
    {},
): AutomationExecution {
  return {
    executionId:
      1n,

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

    inputJson:
      null,

    outputJson:
      null,

    errorMessage:
      null,

    rowVersion:
      Buffer.from(
        "0102030405060708",
        "hex",
      ),

    ...overrides,
  };
}

class FakeHistorySource {
  public recent:
    AutomationExecution[] =
    [];

  public automationRecent:
    AutomationExecution[] =
    [];

  public failures:
    AutomationExecution[] =
    [];

  public recentLimits:
    number[] =
    [];

  public automationCalls:
    Array<{
      automationId: bigint;
      limit: number;
    }> = [];

  public failureLimits:
    number[] =
    [];

  public async listRecent(
    limit = 50,
  ): Promise<AutomationExecution[]> {
    this.recentLimits.push(
      limit,
    );

    return this.recent;
  }

  public async listRecentByAutomationId(
    automationId: bigint,
    limit = 50,
  ): Promise<AutomationExecution[]> {
    this.automationCalls.push({
      automationId,
      limit,
    });

    return this.automationRecent;
  }

  public async listRecentFailures(
    limit = 50,
  ): Promise<AutomationExecution[]> {
    this.failureLimits.push(
      limit,
    );

    return this.failures;
  }
}

describe(
  "ExecutionHistoryService",
  () => {
    it(
      "projects recent execution history",
      async () => {
        const source =
          new FakeHistorySource();

        source.recent = [
          execution(),
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const result =
          await service.getRecent(
            25,
          );

        expect(source.recentLimits)
          .toEqual([
            25,
          ]);

        expect(result.count)
          .toBe(1);

        expect(result.items[0])
          .toMatchObject({
            publicId:
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

            automationId:
              10n,

            triggerId:
              20n,

            status:
              "succeeded",

            durationMilliseconds:
              2500,

            errorMessage:
              null,

            hasFailure:
              false,
          });
      },
    );

    it(
      "makes failed executions explicitly visible",
      async () => {
        const source =
          new FakeHistorySource();

        source.failures = [
          execution({
            status:
              "failed",

            errorMessage:
              "handler failed",
          }),
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const result =
          await service
            .getRecentFailures(
              15,
            );

        expect(source.failureLimits)
          .toEqual([
            15,
          ]);

        expect(result.items[0]?.status)
          .toBe(
            "failed",
          );

        expect(
          result.items[0]?.hasFailure,
        ).toBe(true);

        expect(
          result.items[0]?.errorMessage,
        ).toBe(
          "handler failed",
        );
      },
    );

    it(
      "supports automation-scoped history",
      async () => {
        const source =
          new FakeHistorySource();

        source.automationRecent = [
          execution({
            automationId:
              77n,
          }),
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const result =
          await service
            .getRecentForAutomation(
              77n,
              12,
            );

        expect(source.automationCalls)
          .toEqual([
            {
              automationId:
                77n,

              limit:
                12,
            },
          ]);

        expect(
          result.items[0]?.automationId,
        ).toBe(
          77n,
        );
      },
    );

    it(
      "returns null duration for incomplete executions",
      async () => {
        const source =
          new FakeHistorySource();

        source.recent = [
          execution({
            status:
              "running",

            completedAtUtc:
              null,
          }),
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const result =
          await service.getRecent();

        expect(
          result.items[0]
            ?.durationMilliseconds,
        ).toBeNull();
      },
    );

    it(
      "does not classify cancellation as execution failure",
      async () => {
        const source =
          new FakeHistorySource();

        source.recent = [
          execution({
            status:
              "cancelled",

            errorMessage:
              "cancelled by operator",
          }),
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const result =
          await service.getRecent();

        expect(
          result.items[0]?.status,
        ).toBe(
          "cancelled",
        );

        expect(
          result.items[0]?.hasFailure,
        ).toBe(false);
      },
    );

    it(
      "returns defensive Date copies",
      async () => {
        const source =
          new FakeHistorySource();

        const original =
          execution();

        source.recent = [
          original,
        ];

        const service =
          new ExecutionHistoryService(
            source,
          );

        const first =
          await service.getRecent();

        const second =
          await service.getRecent();

        expect(
          first.items[0]
            ?.requestedAtUtc,
        ).not.toBe(
          original.requestedAtUtc,
        );

        expect(
          first.items[0]
            ?.requestedAtUtc,
        ).not.toBe(
          second.items[0]
            ?.requestedAtUtc,
        );

        first.items[0]
          ?.requestedAtUtc
          .setUTCFullYear(
            2035,
          );

        expect(
          second.items[0]
            ?.requestedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-15T16:00:00.000Z",
        );
      },
    );

    it(
      "returns an empty stable result",
      async () => {
        const source =
          new FakeHistorySource();

        const service =
          new ExecutionHistoryService(
            source,
          );

        await expect(
          service.getRecent(),
        ).resolves.toEqual({
          count:
            0,

          items:
            [],
        });
      },
    );
  },
);
