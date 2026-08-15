import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

import type {
  SchedulerRuntimeLoop,
} from "../src/scheduling/scheduler_runtime.js";

import type {
  SchedulerPollingLoopResult,
} from "../src/scheduling/scheduler_polling_loop.js";

function loopResult(
  overrides:
    Partial<SchedulerPollingLoopResult> =
    {},
): SchedulerPollingLoopResult {
  return {
    cycles:
      1,

    successfulCycles:
      1,

    failedCycles:
      0,

    candidates:
      2,

    dispatched:
      1,

    skipped:
      1,

    failedDispatches:
      0,

    lastEvaluatedAtUtc:
      new Date(
        "2026-08-15T12:00:00.000Z",
      ),

    lastCycleError:
      null,

    ...overrides,
  };
}

class AbortControlledLoop
implements SchedulerRuntimeLoop {
  public runCalls =
    0;

  public receivedSignal:
    AbortSignal | null =
    null;

  public completion:
    SchedulerPollingLoopResult =
    loopResult();

  public async run(
    signal: AbortSignal,
  ): Promise<SchedulerPollingLoopResult> {
    this.runCalls++;

    this.receivedSignal =
      signal;

    if (signal.aborted) {
      return this.completion;
    }

    return new Promise(
      (
        resolve,
      ) => {
        signal.addEventListener(
          "abort",
          () => {
            resolve(
              this.completion,
            );
          },
          {
            once:
              true,
          },
        );
      },
    );
  }
}

class ImmediateSuccessLoop
implements SchedulerRuntimeLoop {
  public async run(
    _signal: AbortSignal,
  ): Promise<SchedulerPollingLoopResult> {
    return loopResult({
      cycles:
        3,

      dispatched:
        2,
    });
  }
}

class ImmediateFailureLoop
implements SchedulerRuntimeLoop {
  public readonly error =
    new Error(
      "synthetic scheduler loop failure",
    );

  public async run(
    _signal: AbortSignal,
  ): Promise<SchedulerPollingLoopResult> {
    throw this.error;
  }
}

describe(
  "SchedulerRuntime",
  () => {
    it(
      "starts in the idle state",
      () => {
        const runtime =
          new SchedulerRuntime(
            new AbortControlledLoop(),
          );

        expect(runtime.state)
          .toBe(
            "idle",
          );

        expect(runtime.isRunning)
          .toBe(false);

        expect(
          runtime.getLastResult(),
        ).toBeNull();

        expect(
          runtime.getTerminalError(),
        ).toBeNull();
      },
    );

    it(
      "starts exactly one scheduler loop",
      () => {
        const loop =
          new AbortControlledLoop();

        const runtime =
          new SchedulerRuntime(
            loop,
          );

        runtime.start();

        expect(runtime.state)
          .toBe(
            "running",
          );

        expect(runtime.isRunning)
          .toBe(true);

        expect(loop.runCalls)
          .toBe(1);

        expect(
          loop.receivedSignal,
        ).not.toBeNull();

        expect(
          loop.receivedSignal
            ?.aborted,
        ).toBe(false);
      },
    );

    it(
      "rejects duplicate start",
      () => {
        const runtime =
          new SchedulerRuntime(
            new AbortControlledLoop(),
          );

        runtime.start();

        expect(
          () =>
            runtime.start(),
        ).toThrow(
          "SchedulerRuntime can only be started once.",
        );
      },
    );

    it(
      "treats stop before start as an idempotent no-op",
      async () => {
        const loop =
          new AbortControlledLoop();

        const runtime =
          new SchedulerRuntime(
            loop,
          );

        const first =
          await runtime.stop();

        const second =
          await runtime.stop();

        expect(first)
          .toBeNull();

        expect(second)
          .toBeNull();

        expect(loop.runCalls)
          .toBe(0);

        expect(runtime.state)
          .toBe(
            "idle",
          );
      },
    );

    it(
      "aborts and awaits a running scheduler loop",
      async () => {
        const loop =
          new AbortControlledLoop();

        const runtime =
          new SchedulerRuntime(
            loop,
          );

        runtime.start();

        const result =
          await runtime.stop();

        expect(
          loop.receivedSignal
            ?.aborted,
        ).toBe(true);

        expect(runtime.state)
          .toBe(
            "stopped",
          );

        expect(runtime.isRunning)
          .toBe(false);

        expect(result?.cycles)
          .toBe(1);

        expect(
          runtime
            .getLastResult()
            ?.dispatched,
        ).toBe(1);
      },
    );

    it(
      "makes stop idempotent after successful shutdown",
      async () => {
        const loop =
          new AbortControlledLoop();

        const runtime =
          new SchedulerRuntime(
            loop,
          );

        runtime.start();

        const first =
          await runtime.stop();

        const second =
          await runtime.stop();

        expect(first?.cycles)
          .toBe(1);

        expect(second?.cycles)
          .toBe(1);

        expect(loop.runCalls)
          .toBe(1);
      },
    );

    it(
      "captures a naturally completed polling loop",
      async () => {
        const runtime =
          new SchedulerRuntime(
            new ImmediateSuccessLoop(),
          );

        runtime.start();

        const result =
          await runtime.waitForExit();

        expect(runtime.state)
          .toBe(
            "stopped",
          );

        expect(result?.cycles)
          .toBe(3);

        expect(result?.dispatched)
          .toBe(2);

        const snapshot =
          runtime.getLastResult();

        expect(snapshot?.cycles)
          .toBe(3);

        expect(
          snapshot
            ?.lastEvaluatedAtUtc,
        ).not.toBe(
          result
            ?.lastEvaluatedAtUtc,
        );
      },
    );

    it(
      "retains and surfaces terminal polling-loop failure",
      async () => {
        const loop =
          new ImmediateFailureLoop();

        const runtime =
          new SchedulerRuntime(
            loop,
          );

        runtime.start();

        await expect(
          runtime.waitForExit(),
        ).rejects.toThrow(
          "synthetic scheduler loop failure",
        );

        expect(runtime.state)
          .toBe(
            "failed",
          );

        expect(
          runtime.getTerminalError(),
        ).toBe(
          loop.error,
        );

        await expect(
          runtime.stop(),
        ).rejects.toThrow(
          "synthetic scheduler loop failure",
        );
      },
    );
  },
);
