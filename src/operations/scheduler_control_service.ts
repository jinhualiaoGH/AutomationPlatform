import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

export type SchedulerControlCommand =
  | "start"
  | "stop";

export type SchedulerControlDisposition =
  | "executed"
  | "noop"
  | "rejected";

export type SchedulerControlTarget = {
  readonly state:
    SchedulerRuntimeState;

  readonly isRunning:
    boolean;

  start():
    void;

  stop():
    Promise<unknown>;
};

export type SchedulerControlResult = {
  command:
    SchedulerControlCommand;

  disposition:
    SchedulerControlDisposition;

  previousState:
    SchedulerRuntimeState;

  currentState:
    SchedulerRuntimeState;

  changed:
    boolean;

  reason:
    string | null;
};

function result(
  command:
    SchedulerControlCommand,

  disposition:
    SchedulerControlDisposition,

  previousState:
    SchedulerRuntimeState,

  currentState:
    SchedulerRuntimeState,

  reason:
    string | null,
): SchedulerControlResult {
  return {
    command,

    disposition,

    previousState,

    currentState,

    changed:
      previousState !==
      currentState,

    reason,
  };
}

export class SchedulerControlService {
  public constructor(
    private readonly scheduler:
      SchedulerControlTarget,
  ) {}

  public start():
    SchedulerControlResult {
    const previousState =
      this.scheduler.state;

    if (previousState !== "idle") {
      return result(
        "start",
        "rejected",
        previousState,
        this.scheduler.state,
        "SchedulerRuntime is single-start and can only start from idle.",
      );
    }

    this.scheduler.start();

    return result(
      "start",
      "executed",
      previousState,
      this.scheduler.state,
      null,
    );
  }

  public async stop():
    Promise<SchedulerControlResult> {
    const previousState =
      this.scheduler.state;

    if (previousState !== "running") {
      return result(
        "stop",
        "noop",
        previousState,
        this.scheduler.state,
        "SchedulerRuntime is not currently running.",
      );
    }

    await this.scheduler.stop();

    return result(
      "stop",
      "executed",
      previousState,
      this.scheduler.state,
      null,
    );
  }
}
