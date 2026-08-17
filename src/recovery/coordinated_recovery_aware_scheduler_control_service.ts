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

import type {
  FrozenSchedulerControlHandler,
} from "./recovery_aware_scheduler_control_service.js";

import type {
  ProductionDurableRecoveryCoordinationResult,
} from "./production_durable_recovery_coordination_adapter.js";


export type CoordinatedRecoveryAwareSchedulerControlCommand =
  | SchedulerControlCommand
  | SchedulerRestartCommand;


export type CoordinatedSchedulerRestartResult =
  ProductionDurableRecoveryCoordinationResult<
    SchedulerRestartResult
  >;


export type CoordinatedRecoveryAwareSchedulerControlResult =
  | SchedulerControlResult
  | CoordinatedSchedulerRestartResult;


export type CoordinatedSchedulerRestartHandler = {
  restart():
    Promise<CoordinatedSchedulerRestartResult>;
};


/*
 * A11.6 deliberately leaves the frozen A9/A10
 * RecoveryAwareSchedulerControlService unchanged.
 *
 * start/stop:
 *   preserve the frozen SchedulerControlResult ABI.
 *
 * restart:
 *   accepts the A11 coordination result space:
 *
 *     - frozen rejected SchedulerRestartResult
 *     - restarted
 *     - superseded
 */
export class CoordinatedRecoveryAwareSchedulerControlService {
  public constructor(
    private readonly frozenControl:
      FrozenSchedulerControlHandler,

    private readonly restartHandler:
      CoordinatedSchedulerRestartHandler,
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
    Promise<CoordinatedSchedulerRestartResult> {

    return this.restartHandler.restart();
  }


  public execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ):
    Promise<CoordinatedRecoveryAwareSchedulerControlResult> {

    switch (command) {

      case "start":
        return Promise.resolve()
          .then(
            () =>
              this.start(),
          );


      case "stop":
        return this.stop();


      case schedulerRestartCommand:
        return this.restart();
    }
  }
}
