import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "./coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "./coordinated_recovery_aware_scheduler_control_service.js";

import {
  evaluateSchedulerControlAdmission,
  type SchedulerControlAdmissionDenialReason,
} from "./scheduler_control_admission.js";

import type {
  SchedulerFailoverReadinessReader,
} from "./scheduler_failover_readiness_service.js";


/**
 * Production-shaped delegate.
 *
 * Unlike the A17.3 command decorator, this boundary preserves the full
 * coordinated request including request-key/idempotency information.
 */
export type CoordinatedSchedulerControlRequestDelegate = {

  execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<CoordinatedRecoveryAwareSchedulerControlResult>;
};


export type CoordinatedSchedulerControlAdmissionDeniedResult = {

  readonly kind:
    "admission_denied";

  readonly command:
    CoordinatedRecoveryAwareSchedulerControlRequest["command"];

  readonly reason:
    SchedulerControlAdmissionDenialReason;
};


export type ReadinessAwareCoordinatedSchedulerControlResult =
  | CoordinatedRecoveryAwareSchedulerControlResult
  | CoordinatedSchedulerControlAdmissionDeniedResult;


export type ReadinessAwareCoordinatedSchedulerControlHandler = {

  execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<ReadinessAwareCoordinatedSchedulerControlResult>;
};


/**
 * Enforces A17 readiness admission immediately before an existing
 * request-oriented coordinated executor.
 *
 * The delegate may therefore remain the frozen audited coordinated
 * executor.
 *
 * Admission denial intentionally occurs outside that existing audit
 * contract because A17's "admission_denied" result is not part of the
 * frozen coordination-audit result-kind ABI.
 */
export class ReadinessAwareCoordinatedSchedulerControlExecutor
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public constructor(
    private readonly delegate:
      CoordinatedSchedulerControlRequestDelegate,

    private readonly readiness:
      SchedulerFailoverReadinessReader,
  ) {}


  public async execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
  Promise<ReadinessAwareCoordinatedSchedulerControlResult> {

    const currentReadiness =
      this.readiness.snapshot();


    const admission =
      evaluateSchedulerControlAdmission(
        request.command,
        currentReadiness,
      );


    if (!admission.admitted) {

      return {
        kind:
          "admission_denied",

        command:
          request.command,

        reason:
          admission.reason,
      };
    }


    /*
     * Preserve the complete original request.
     *
     * This is important for request-key idempotency and for all frozen
     * coordinated/audited semantics downstream.
     */
    return this.delegate.execute(
      request,
    );
  }
}
