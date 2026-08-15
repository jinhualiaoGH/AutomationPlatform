import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AdvanceAutomationScheduleState,
  AutomationScheduleState,
  DueAutomationSchedule,
} from "../src/scheduling/schedule_state.js";

import {
  TriggerDispatcher,
} from "../src/scheduling/trigger_dispatcher.js";

function createCandidate(
  overrides:
    Partial<DueAutomationSchedule> = {},
): DueAutomationSchedule {
  return {
    scheduleStateId:
      1n,

    triggerId:
      11n,

    triggerPublicId:
      "11111111-1111-4111-8111-111111111111",

    automationId:
      21n,

    automationPublicId:
      "22222222-2222-4222-8222-222222222222",

    configurationJson:
      JSON.stringify({
        intervalSeconds: 60,
      }),

    nextFireAtUtc:
      new Date(
        "2026-08-15T12:00:00.000Z",
      ),

    lastEvaluatedAtUtc:
      null,

    rowVersion:
      Buffer.from(
        "0102030405060708",
        "hex",
      ),

    ...overrides,
  };
}

function createClaimedState(
  input:
    AdvanceAutomationScheduleState,
): AutomationScheduleState {
  return {
    scheduleStateId:
      1n,

    triggerId:
      input.triggerId,

    nextFireAtUtc:
      new Date(
        input.nextFireAtUtc.getTime(),
      ),

    lastEvaluatedAtUtc:
      new Date(
        input.evaluatedAtUtc.getTime(),
      ),

    createdAtUtc:
      new Date(
        "2026-08-15T00:00:00.000Z",
      ),

    updatedAtUtc:
      new Date(
        "2026-08-15T12:00:00.000Z",
      ),

    rowVersion:
      Buffer.from(
        "1112131415161718",
        "hex",
      ),
  };
}

class FakeScheduleStateStore {
  public readonly advanceCalls:
    AdvanceAutomationScheduleState[] = [];

  public claimSucceeds =
    true;

  public constructor(
    private readonly due:
      DueAutomationSchedule[],
  ) {}

  public async listDue(
    _evaluatedAtUtc: Date,
    _limit?: number,
  ): Promise<DueAutomationSchedule[]> {
    return this.due;
  }

  public async advance(
    input:
      AdvanceAutomationScheduleState,
  ): Promise<AutomationScheduleState | null> {
    this.advanceCalls.push(input);

    if (!this.claimSucceeds) {
      return null;
    }

    return createClaimedState(input);
  }
}

class FakeExecutionRunner {
  public readonly calls: Array<{
    automationPublicId: string;
    input: unknown;
    triggerId: bigint | undefined;
  }> = [];

  public failure:
    Error | null = null;

  public async run(
    automationPublicId: string,
    input?: unknown,
    triggerId?: bigint,
  ): Promise<unknown> {
    this.calls.push({
      automationPublicId,
      input,
      triggerId,
    });

    if (this.failure) {
      throw this.failure;
    }

    return {};
  }
}

describe(
  "TriggerDispatcher",
  () => {
    it(
      "claims the occurrence before execution and forwards trigger provenance",
      async () => {
        const candidate =
          createCandidate();

        const states =
          new FakeScheduleStateStore([
            candidate,
          ]);

        const runner =
          new FakeExecutionRunner();

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(states.advanceCalls)
          .toHaveLength(1);

        expect(
          states.advanceCalls[0]
            ?.nextFireAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-15T12:01:00.000Z",
        );

        expect(runner.calls)
          .toHaveLength(1);

        expect(
          runner.calls[0]
            ?.automationPublicId,
        ).toBe(
          candidate.automationPublicId,
        );

        expect(
          runner.calls[0]?.triggerId,
        ).toBe(
          candidate.triggerId,
        );

        expect(summary.dispatched)
          .toBe(1);

        expect(summary.skipped)
          .toBe(0);

        expect(summary.failed)
          .toBe(0);
      },
    );

    it(
      "skips execution when the optimistic claim is stale",
      async () => {
        const states =
          new FakeScheduleStateStore([
            createCandidate(),
          ]);

        states.claimSucceeds =
          false;

        const runner =
          new FakeExecutionRunner();

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(states.advanceCalls)
          .toHaveLength(1);

        expect(runner.calls)
          .toHaveLength(0);

        expect(summary.skipped)
          .toBe(1);

        expect(summary.dispatched)
          .toBe(0);
      },
    );

    it(
      "rejects malformed persisted schedule configuration before claiming",
      async () => {
        const states =
          new FakeScheduleStateStore([
            createCandidate({
              configurationJson:
                JSON.stringify({
                  intervalSeconds: 0,
                }),
            }),
          ]);

        const runner =
          new FakeExecutionRunner();

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(states.advanceCalls)
          .toHaveLength(0);

        expect(runner.calls)
          .toHaveLength(0);

        expect(summary.failed)
          .toBe(1);

        expect(
          summary.outcomes[0]
            ?.errorMessage,
        ).not.toBeNull();
      },
    );

    it(
      "coalesces overdue intervals into one execution",
      async () => {
        const states =
          new FakeScheduleStateStore([
            createCandidate(),
          ]);

        const runner =
          new FakeExecutionRunner();

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:05:30.000Z",
            ),
          );

        expect(states.advanceCalls)
          .toHaveLength(1);

        expect(
          states.advanceCalls[0]
            ?.nextFireAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-15T12:06:00.000Z",
        );

        expect(runner.calls)
          .toHaveLength(1);

        expect(summary.dispatched)
          .toBe(1);
      },
    );

    it(
      "isolates execution failure after a successful claim",
      async () => {
        const states =
          new FakeScheduleStateStore([
            createCandidate(),
          ]);

        const runner =
          new FakeExecutionRunner();

        runner.failure =
          new Error(
            "synthetic runtime failure",
          );

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(states.advanceCalls)
          .toHaveLength(1);

        expect(runner.calls)
          .toHaveLength(1);

        expect(summary.failed)
          .toBe(1);

        expect(
          summary.outcomes[0]
            ?.errorMessage,
        ).toBe(
          "synthetic runtime failure",
        );
      },
    );

    it(
      "continues dispatching later candidates after one candidate fails",
      async () => {
        const invalid =
          createCandidate({
            triggerId:
              11n,

            configurationJson:
              "{invalid-json",
          });

        const valid =
          createCandidate({
            scheduleStateId:
              2n,

            triggerId:
              12n,

            triggerPublicId:
              "33333333-3333-4333-8333-333333333333",
          });

        const states =
          new FakeScheduleStateStore([
            invalid,
            valid,
          ]);

        const runner =
          new FakeExecutionRunner();

        const dispatcher =
          new TriggerDispatcher(
            states,
            runner,
          );

        const summary =
          await dispatcher.dispatchDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          );

        expect(summary.candidates)
          .toBe(2);

        expect(summary.failed)
          .toBe(1);

        expect(summary.dispatched)
          .toBe(1);

        expect(runner.calls)
          .toHaveLength(1);

        expect(
          runner.calls[0]?.triggerId,
        ).toBe(12n);
      },
    );

    it(
      "rejects an invalid evaluation time",
      async () => {
        const dispatcher =
          new TriggerDispatcher(
            new FakeScheduleStateStore([]),
            new FakeExecutionRunner(),
          );

        await expect(
          dispatcher.dispatchDue(
            new Date(Number.NaN),
          ),
        ).rejects.toThrow(
          "evaluatedAtUtc must be a valid Date.",
        );
      },
    );
  },
);
