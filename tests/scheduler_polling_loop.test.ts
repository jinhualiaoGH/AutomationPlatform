import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerPollingLoop,
} from "../src/scheduling/scheduler_polling_loop.js";

import type {
  SchedulerClock,
  SchedulerDispatcher,
  SchedulerSleeper,
} from "../src/scheduling/scheduler_polling_loop.js";

import type {
  TriggerDispatchSummary,
} from "../src/scheduling/trigger_dispatcher.js";

function successfulSummary(
  evaluatedAtUtc: Date,
): TriggerDispatchSummary {
  return {
    evaluatedAtUtc:
      new Date(
        evaluatedAtUtc.getTime(),
      ),

    candidates:
      2,

    dispatched:
      1,

    skipped:
      1,

    failed:
      0,

    outcomes:
      [],
  };
}

class FakeClock
implements SchedulerClock {
  private index =
    0;

  public constructor(
    private readonly values:
      Date[],
  ) {}

  public now(): Date {
    const value =
      this.values[
        Math.min(
          this.index,
          this.values.length - 1,
        )
      ];

    this.index++;

    if (!value) {
      throw new Error(
        "FakeClock has no configured values.",
      );
    }

    return new Date(
      value.getTime(),
    );
  }
}

class FakeDispatcher
implements SchedulerDispatcher {
  public readonly calls: Array<{
    evaluatedAtUtc: Date;
    limit: number | undefined;
  }> = [];

  public readonly failingCalls =
    new Set<number>();

  public async dispatchDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<TriggerDispatchSummary> {
    const callIndex =
      this.calls.length;

    this.calls.push({
      evaluatedAtUtc:
        new Date(
          evaluatedAtUtc.getTime(),
        ),

      limit,
    });

    if (
      this.failingCalls.has(
        callIndex,
      )
    ) {
      throw new Error(
        "synthetic dispatcher failure",
      );
    }

    return successfulSummary(
      evaluatedAtUtc,
    );
  }
}

class FakeSleeper
implements SchedulerSleeper {
  public readonly calls:
    number[] = [];

  public failureAtCall:
    number | null = null;

  public constructor(
    private readonly controller:
      AbortController,

    private readonly abortAfterCalls:
      number,
  ) {}

  public async sleep(
    milliseconds: number,
    _signal: AbortSignal,
  ): Promise<void> {
    this.calls.push(
      milliseconds,
    );

    if (
      this.failureAtCall ===
      this.calls.length
    ) {
      throw new Error(
        "synthetic sleeper failure",
      );
    }

    if (
      this.calls.length >=
      this.abortAfterCalls
    ) {
      this.controller.abort();
    }
  }
}

describe(
  "SchedulerPollingLoop",
  () => {
    it(
      "rejects an invalid poll interval",
      () => {
        expect(
          () =>
            new SchedulerPollingLoop(
              new FakeDispatcher(),
              new FakeClock([
                new Date(
                  "2026-08-15T12:00:00.000Z",
                ),
              ]),
              new FakeSleeper(
                new AbortController(),
                1,
              ),
              {
                pollIntervalMs: 0,
              },
            ),
        ).toThrow(
          "pollIntervalMs must be a positive integer.",
        );
      },
    );

    it(
      "rejects an invalid batch limit",
      () => {
        expect(
          () =>
            new SchedulerPollingLoop(
              new FakeDispatcher(),
              new FakeClock([
                new Date(
                  "2026-08-15T12:00:00.000Z",
                ),
              ]),
              new FakeSleeper(
                new AbortController(),
                1,
              ),
              {
                batchLimit:
                  1_001,
              },
            ),
        ).toThrow(
          "batchLimit must be at most 1000.",
        );
      },
    );

    it(
      "does nothing when already cancelled",
      async () => {
        const controller =
          new AbortController();

        controller.abort();

        const dispatcher =
          new FakeDispatcher();

        const clock =
          new FakeClock([
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            1,
          );

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
          );

        const result =
          await loop.run(
            controller.signal,
          );

        expect(result.cycles)
          .toBe(0);

        expect(
          dispatcher.calls,
        ).toHaveLength(0);

        expect(sleeper.calls)
          .toHaveLength(0);

        expect(
          result.lastEvaluatedAtUtc,
        ).toBeNull();
      },
    );

    it(
      "runs one cycle and stops cleanly when aborted during sleep",
      async () => {
        const controller =
          new AbortController();

        const dispatcher =
          new FakeDispatcher();

        const clock =
          new FakeClock([
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            1,
          );

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
            {
              pollIntervalMs:
                250,
            },
          );

        const result =
          await loop.run(
            controller.signal,
          );

        expect(result.cycles)
          .toBe(1);

        expect(
          result.successfulCycles,
        ).toBe(1);

        expect(
          result.failedCycles,
        ).toBe(0);

        expect(result.candidates)
          .toBe(2);

        expect(result.dispatched)
          .toBe(1);

        expect(result.skipped)
          .toBe(1);

        expect(
          result.failedDispatches,
        ).toBe(0);

        expect(sleeper.calls)
          .toEqual([
            250,
          ]);
      },
    );

    it(
      "runs repeated deterministic cycles with the configured batch limit",
      async () => {
        const controller =
          new AbortController();

        const dispatcher =
          new FakeDispatcher();

        const clock =
          new FakeClock([
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),

            new Date(
              "2026-08-15T12:00:01.000Z",
            ),

            new Date(
              "2026-08-15T12:00:02.000Z",
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            3,
          );

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
            {
              pollIntervalMs:
                1_000,

              batchLimit:
                7,
            },
          );

        const result =
          await loop.run(
            controller.signal,
          );

        expect(result.cycles)
          .toBe(3);

        expect(
          result.successfulCycles,
        ).toBe(3);

        expect(
          dispatcher.calls,
        ).toHaveLength(3);

        expect(
          dispatcher.calls.map(
            (call) =>
              call.limit,
          ),
        ).toEqual([
          7,
          7,
          7,
        ]);

        expect(
          dispatcher.calls.map(
            (call) =>
              call.evaluatedAtUtc
                .toISOString(),
          ),
        ).toEqual([
          "2026-08-15T12:00:00.000Z",
          "2026-08-15T12:00:01.000Z",
          "2026-08-15T12:00:02.000Z",
        ]);

        expect(result.candidates)
          .toBe(6);

        expect(result.dispatched)
          .toBe(3);

        expect(result.skipped)
          .toBe(3);
      },
    );

    it(
      "isolates a dispatcher cycle failure and continues polling",
      async () => {
        const controller =
          new AbortController();

        const dispatcher =
          new FakeDispatcher();

        dispatcher.failingCalls.add(
          0,
        );

        const clock =
          new FakeClock([
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),

            new Date(
              "2026-08-15T12:00:01.000Z",
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            2,
          );

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
          );

        const result =
          await loop.run(
            controller.signal,
          );

        expect(result.cycles)
          .toBe(2);

        expect(
          result.failedCycles,
        ).toBe(1);

        expect(
          result.successfulCycles,
        ).toBe(1);

        expect(
          dispatcher.calls,
        ).toHaveLength(2);

        expect(
          result.lastCycleError,
        ).toBe(
          "synthetic dispatcher failure",
        );

        expect(result.dispatched)
          .toBe(1);
      },
    );

    it(
      "rejects an invalid injected clock value",
      async () => {
        const controller =
          new AbortController();

        const dispatcher =
          new FakeDispatcher();

        const clock =
          new FakeClock([
            new Date(
              Number.NaN,
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            1,
          );

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
          );

        await expect(
          loop.run(
            controller.signal,
          ),
        ).rejects.toThrow(
          "Scheduler clock value must be a valid Date.",
        );

        expect(
          dispatcher.calls,
        ).toHaveLength(0);

        expect(sleeper.calls)
          .toHaveLength(0);
      },
    );

    it(
      "propagates a non-cancellation sleeper failure",
      async () => {
        const controller =
          new AbortController();

        const dispatcher =
          new FakeDispatcher();

        const clock =
          new FakeClock([
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
          ]);

        const sleeper =
          new FakeSleeper(
            controller,
            100,
          );

        sleeper.failureAtCall =
          1;

        const loop =
          new SchedulerPollingLoop(
            dispatcher,
            clock,
            sleeper,
          );

        await expect(
          loop.run(
            controller.signal,
          ),
        ).rejects.toThrow(
          "synthetic sleeper failure",
        );

        expect(
          dispatcher.calls,
        ).toHaveLength(1);

        expect(sleeper.calls)
          .toEqual([
            1_000,
          ]);
      },
    );
  },
);
