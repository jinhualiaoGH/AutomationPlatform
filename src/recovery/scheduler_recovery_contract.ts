import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

export const schedulerRestartCommand =
  "restart" as const;

export type SchedulerRestartCommand =
  typeof schedulerRestartCommand;

export const initialSchedulerGeneration =
  1;

export type SchedulerGeneration =
  number;

export type RestartableSchedulerRuntimeState =
  | "running"
  | "stopped"
  | "failed";

export type SchedulerRestartDisposition =
  | "executed"
  | "rejected";

export interface SchedulerGenerationRuntime {
  readonly state:
    SchedulerRuntimeState;

  readonly isRunning:
    boolean;

  start():
    void;

  stop():
    Promise<unknown>;
}

export interface SchedulerGenerationFactory {
  create(
    generation:
      SchedulerGeneration,
  ): SchedulerGenerationRuntime;
}

export type SchedulerRestartResult = {
  command:
    SchedulerRestartCommand;

  disposition:
    SchedulerRestartDisposition;

  previousGeneration:
    SchedulerGeneration;

  currentGeneration:
    SchedulerGeneration;

  previousState:
    SchedulerRuntimeState;

  currentState:
    SchedulerRuntimeState;

  changed:
    boolean;

  reason:
    string | null;
};

export function assertValidSchedulerGeneration(
  generation:
    number,
): void {
  if (
    !Number.isSafeInteger(
      generation,
    ) ||
    generation <
      initialSchedulerGeneration
  ) {
    throw new Error(
      "generation must be a positive safe integer.",
    );
  }
}

export function nextSchedulerGeneration(
  currentGeneration:
    SchedulerGeneration,
): SchedulerGeneration {
  assertValidSchedulerGeneration(
    currentGeneration,
  );

  if (
    currentGeneration >=
    Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "scheduler generation overflow.",
    );
  }

  return currentGeneration + 1;
}

export function isRestartableSchedulerRuntimeState(
  state:
    SchedulerRuntimeState,
): state is RestartableSchedulerRuntimeState {
  return (
    state === "running" ||
    state === "stopped" ||
    state === "failed"
  );
}
