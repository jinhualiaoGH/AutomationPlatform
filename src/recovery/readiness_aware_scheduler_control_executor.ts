import type {
  CoordinatedRecoveryAwareSchedulerControlCommand,
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "./coordinated_recovery_aware_scheduler_control_service.js";

import {
  evaluateSchedulerControlAdmission,
  type SchedulerControlAdmissionDenialReason,
} from "./scheduler_control_admission.js";

import type {
  SchedulerFailoverReadinessReader,
} from "./scheduler_failover_readiness_service.js";


export type SchedulerControlAdmissionDeniedResult = {

  readonly kind:
    "admission_denied";

  readonly command:
    CoordinatedRecoveryAwareSchedulerControlCommand;

  readonly reason:
    SchedulerControlAdmissionDenialReason;
};


export type ReadinessAwareSchedulerControlResult =
  | CoordinatedRecoveryAwareSchedulerControlResult
  | SchedulerControlAdmissionDeniedResult;


export type ReadinessAwareSchedulerControlDelegate = {

  execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ):
    Promise<CoordinatedRecoveryAwareSchedulerControlResult>;
};


export type ReadinessAwareSchedulerControlHandler = {

  execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ):
    Promise<ReadinessAwareSchedulerControlResult>;
};


/**
 * Admission-aware decorator over the frozen coordinated scheduler-control
 * command seam.
 *
 * A17 reads current readiness for every command attempt and delegates
 * only while active scheduler authority is present.
 */
export class ReadinessAwareSchedulerControlExecutor
implements ReadinessAwareSchedulerControlHandler {

  public constructor(
    private readonly delegate:
      ReadinessAwareSchedulerControlDelegate,

    private readonly readiness:
      SchedulerFailoverReadinessReader,
  ) {}


  public async execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ):
  Promise<ReadinessAwareSchedulerControlResult> {

    const currentReadiness =
      this.readiness.snapshot();


    const admission =
      evaluateSchedulerControlAdmission(
        command,
        currentReadiness,
      );


    if (!admission.admitted) {

      return {
        kind:
          "admission_denied",

        command,

        reason:
          admission.reason,
      };
    }


    return this.delegate.execute(
      command,
    );
  }
}
