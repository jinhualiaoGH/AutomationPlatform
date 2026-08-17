import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "./coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "./coordinated_recovery_aware_scheduler_control_service.js";

import type {
  SchedulerRecoveryCoordinationAuditCompletion,
} from "../repositories/scheduler_recovery_coordination_audit_repository.js";


export type CoordinatedRecoverySchedulerControlCommandExecutor = {
  execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<
      CoordinatedRecoveryAwareSchedulerControlResult
    >;
};


export type CoordinatedRecoverySchedulerControlAuditWriter = {
  createPending(
    input: {
      readonly command:
        CoordinatedRecoveryAwareSchedulerControlRequest[
          "command"
        ];

      readonly requestKey:
        string | null;
    },
  ):
    Promise<{
      readonly publicId:
        string;
    }>;

  complete(
    publicId:
      string,

    completion:
      SchedulerRecoveryCoordinationAuditCompletion,
  ): Promise<unknown>;

  fail(
    publicId:
      string,

    errorMessage:
      string,
  ): Promise<unknown>;
};


function errorMessageFrom(
  error:
    unknown,
): string {

  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error,
  );
}


function normalizedRequestKey(
  requestKey:
    string | undefined,
): string | null {

  if (requestKey === undefined) {
    return null;
  }


  const normalized =
    requestKey.trim();


  return normalized.length === 0
    ? null
    : normalized;
}


function projectCompletion(
  result:
    CoordinatedRecoveryAwareSchedulerControlResult,
): SchedulerRecoveryCoordinationAuditCompletion {

  if (
    "disposition" in result &&
    result.disposition ===
      "superseded"
  ) {
    return {
      resultKind:
        "superseded",

      disposition:
        "superseded",

      previousState:
        null,

      currentState:
        null,

      previousGeneration:
        null,

      currentGeneration:
        null,

      attemptedGeneration:
        result.attemptedGeneration,

      observedGeneration:
        result.observedGeneration,

      changed:
        false,

      reason:
        "Superseded by a later durable scheduler generation.",
    };
  }


  if (
    "disposition" in result &&
    result.disposition ===
      "restarted"
  ) {

    const restart =
      result.result;


    return {
      resultKind:
        "restarted",

      disposition:
        restart.disposition,

      previousState:
        restart.previousState,

      currentState:
        restart.currentState,

      previousGeneration:
        restart.previousGeneration,

      currentGeneration:
        restart.currentGeneration,

      attemptedGeneration:
        result.previousGeneration,

      observedGeneration:
        result.currentGeneration,

      changed:
        restart.changed,

      reason:
        restart.reason,
    };
  }


  if (
    "command" in result &&
    result.command ===
      "restart"
  ) {
    return {
      resultKind:
        "rejected",

      disposition:
        result.disposition,

      previousState:
        result.previousState,

      currentState:
        result.currentState,

      previousGeneration:
        result.previousGeneration,

      currentGeneration:
        result.currentGeneration,

      attemptedGeneration:
        result.previousGeneration,

      observedGeneration:
        result.currentGeneration,

      changed:
        result.changed,

      reason:
        result.reason,
    };
  }


  return {
    resultKind:
      "control",

    disposition:
      result.disposition,

    previousState:
      result.previousState,

    currentState:
      result.currentState,

    previousGeneration:
      null,

    currentGeneration:
      null,

    attemptedGeneration:
      null,

    observedGeneration:
      null,

    changed:
      result.changed,

    reason:
      result.reason,
  };
}


export class AuditedCoordinatedRecoverySchedulerControlExecutor
implements CoordinatedRecoverySchedulerControlCommandExecutor {

  public constructor(
    private readonly inner:
      CoordinatedRecoverySchedulerControlCommandExecutor,

    private readonly audit:
      CoordinatedRecoverySchedulerControlAuditWriter,
  ) {}


  public async execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<
      CoordinatedRecoveryAwareSchedulerControlResult
    > {

    const pending =
      await this.audit.createPending({
        command:
          request.command,

        requestKey:
          normalizedRequestKey(
            request.requestKey,
          ),
      });


    let result:
      CoordinatedRecoveryAwareSchedulerControlResult;


    try {

      result =
        await this.inner.execute(
          request,
        );
    }
    catch (error) {

      try {
        await this.audit.fail(
          pending.publicId,
          errorMessageFrom(
            error,
          ),
        );
      }
      catch {
        /*
         * Preserve the original command failure exactly,
         * matching the frozen audited-executor rule.
         */
      }


      throw error;
    }


    await this.audit.complete(
      pending.publicId,
      projectCompletion(
        result,
      ),
    );


    return result;
  }
}
