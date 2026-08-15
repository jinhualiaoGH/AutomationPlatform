import {
  SchedulerPollingLoop,
} from "./scheduler_polling_loop.js";

import type {
  SchedulerPollingLoopResult,
} from "./scheduler_polling_loop.js";

export type SchedulerRuntimeState =
  | "idle"
  | "running"
  | "stopped"
  | "failed";

export type SchedulerRuntimeLoop = {
  run(
    signal: AbortSignal,
  ): Promise<SchedulerPollingLoopResult>;
};

type SchedulerRuntimeExit =
  | {
      kind: "success";
      result: SchedulerPollingLoopResult;
    }
  | {
      kind: "failure";
      error: unknown;
    };

export class SchedulerRuntime {
  private stateValue:
    SchedulerRuntimeState =
    "idle";

  private controller:
    AbortController | null =
    null;

  private exitPromise:
    Promise<SchedulerRuntimeExit> | null =
    null;

  private lastResult:
    SchedulerPollingLoopResult | null =
    null;

  private terminalError:
    unknown = null;

  public constructor(
    private readonly loop:
      SchedulerRuntimeLoop =
      new SchedulerPollingLoop(),
  ) {}

  public get state():
    SchedulerRuntimeState {
    return this.stateValue;
  }

  public get isRunning():
    boolean {
    return this.stateValue ===
      "running";
  }

  public start(): void {
    if (
      this.stateValue !==
      "idle"
    ) {
      throw new Error(
        "SchedulerRuntime can only be started once.",
      );
    }

    const controller =
      new AbortController();

    this.controller =
      controller;

    this.stateValue =
      "running";

    this.exitPromise =
      this.loop
        .run(
          controller.signal,
        )
        .then(
          (
            result,
          ): SchedulerRuntimeExit => {
            this.lastResult =
              result;

            this.stateValue =
              "stopped";

            return {
              kind:
                "success",

              result,
            };
          },
          (
            error,
          ): SchedulerRuntimeExit => {
            this.terminalError =
              error;

            this.stateValue =
              "failed";

            return {
              kind:
                "failure",

              error,
            };
          },
        );
  }

  public async stop():
    Promise<
      SchedulerPollingLoopResult | null
    > {
    if (
      this.stateValue ===
      "idle"
    ) {
      return null;
    }

    if (
      this.stateValue ===
      "running"
    ) {
      this.controller
        ?.abort();
    }

    return this.waitForExit();
  }

  public async waitForExit():
    Promise<
      SchedulerPollingLoopResult | null
    > {
    if (
      this.stateValue ===
      "idle"
    ) {
      return null;
    }

    if (!this.exitPromise) {
      throw new Error(
        "SchedulerRuntime exit state is inconsistent.",
      );
    }

    const exit =
      await this.exitPromise;

    if (
      exit.kind ===
      "failure"
    ) {
      throw exit.error;
    }

    return exit.result;
  }

  public getLastResult():
    SchedulerPollingLoopResult | null {
    if (!this.lastResult) {
      return null;
    }

    return {
      ...this.lastResult,

      lastEvaluatedAtUtc:
        this.lastResult
          .lastEvaluatedAtUtc
          ? new Date(
              this.lastResult
                .lastEvaluatedAtUtc
                .getTime(),
            )
          : null,
    };
  }

  public getTerminalError():
    unknown {
    return this.terminalError;
  }
}
