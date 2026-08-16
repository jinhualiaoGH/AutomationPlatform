import {
  initialSchedulerGeneration,
  isRestartableSchedulerRuntimeState,
  nextSchedulerGeneration,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerGeneration,
  SchedulerGenerationFactory,
  SchedulerGenerationRuntime,
  SchedulerRestartResult,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

export type SchedulerRecoverySnapshot = {
  generation:
    SchedulerGeneration;

  state:
    SchedulerRuntimeState;

  isRunning:
    boolean;
};

function rejectedRestart(
  generation:
    SchedulerGeneration,

  state:
    SchedulerRuntimeState,

  reason:
    string,
): SchedulerRestartResult {
  return {
    command:
      "restart",

    disposition:
      "rejected",

    previousGeneration:
      generation,

    currentGeneration:
      generation,

    previousState:
      state,

    currentState:
      state,

    changed:
      false,

    reason,
  };
}

export class SchedulerRecoverySupervisor
implements SchedulerGenerationRuntime {
  private currentGenerationValue:
    SchedulerGeneration;

  private currentRuntimeValue:
    SchedulerGenerationRuntime;

  public constructor(
    private readonly factory:
      SchedulerGenerationFactory,
  ) {
    this.currentGenerationValue =
      initialSchedulerGeneration;

    this.currentRuntimeValue =
      this.factory.create(
        initialSchedulerGeneration,
      );
  }

  public get generation():
    SchedulerGeneration {
    return this.currentGenerationValue;
  }

  public get state():
    SchedulerRuntimeState {
    return this.currentRuntimeValue.state;
  }

  public get isRunning():
    boolean {
    return this.currentRuntimeValue.isRunning;
  }

  public snapshot():
    SchedulerRecoverySnapshot {
    return {
      generation:
        this.currentGenerationValue,

      state:
        this.currentRuntimeValue.state,

      isRunning:
        this.currentRuntimeValue.isRunning,
    };
  }

  public start():
    void {
    this.currentRuntimeValue.start();
  }

  public stop():
    Promise<unknown> {
    return this.currentRuntimeValue.stop();
  }

  public async restart():
    Promise<SchedulerRestartResult> {
    const previousGeneration =
      this.currentGenerationValue;

    const previousRuntime =
      this.currentRuntimeValue;

    const previousState =
      previousRuntime.state;

    if (
      !isRestartableSchedulerRuntimeState(
        previousState,
      )
    ) {
      return rejectedRestart(
        previousGeneration,
        previousState,
        "An idle scheduler generation has not entered operational service.",
      );
    }

    if (
      previousState ===
      "running"
    ) {
      await previousRuntime.stop();
    }

    const replacementGeneration =
      nextSchedulerGeneration(
        previousGeneration,
      );

    const replacementRuntime =
      this.factory.create(
        replacementGeneration,
      );

    replacementRuntime.start();

    this.currentGenerationValue =
      replacementGeneration;

    this.currentRuntimeValue =
      replacementRuntime;

    return {
      command:
        "restart",

      disposition:
        "executed",

      previousGeneration,

      currentGeneration:
        replacementGeneration,

      previousState,

      currentState:
        replacementRuntime.state,

      changed:
        true,

      reason:
        null,
    };
  }
}
