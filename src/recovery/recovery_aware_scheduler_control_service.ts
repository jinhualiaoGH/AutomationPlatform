import type {
  SchedulerControlCommand,
  SchedulerControlResult,
} from "../operations/scheduler_control_service.js";

import {
  schedulerRestartCommand,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerRestartCommand,
  SchedulerRestartResult,
} from "./scheduler_recovery_contract.js";

export type RecoveryAwareSchedulerControlCommand =
  | SchedulerControlCommand
  | SchedulerRestartCommand;

export type RecoveryAwareSchedulerControlResult =
  | SchedulerControlResult
  | SchedulerRestartResult;

export type FrozenSchedulerControlHandler = {
  start():
    SchedulerControlResult;

  stop():
    Promise<SchedulerControlResult>;
};

export type SchedulerRestartHandler = {
  restart():
    Promise<SchedulerRestartResult>;
};

export class RecoveryAwareSchedulerControlService {
  public constructor(
    private readonly frozenControl:
      FrozenSchedulerControlHandler,

    private readonly restartHandler:
      SchedulerRestartHandler,
  ) {}

  public start():
    SchedulerControlResult {
    return this.frozenControl.start();
  }

  public stop():
    Promise<SchedulerControlResult> {
    return this.frozenControl.stop();
  }

  public restart():
    Promise<SchedulerRestartResult> {
    return this.restartHandler.restart();
  }

  public execute(
    command:
      RecoveryAwareSchedulerControlCommand,
  ): Promise<RecoveryAwareSchedulerControlResult> {
    switch (command) {
      case "start":
        return Promise.resolve()
          .then(
            () => this.start(),
          );

      case "stop":
        return this.stop();

      case schedulerRestartCommand:
        return this.restart();
    }
  }
}
