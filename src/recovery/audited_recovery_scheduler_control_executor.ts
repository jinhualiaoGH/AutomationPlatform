import type {
  RecoveryAwareSchedulerControlRequest,
} from "./recovery_aware_scheduler_control_coordinator.js";

import type {
  RecoveryAwareSchedulerControlResult,
} from "./recovery_aware_scheduler_control_service.js";

export type RecoverySchedulerControlCommandExecutor = {
  execute(
    request:
      RecoveryAwareSchedulerControlRequest,
  ): Promise<RecoveryAwareSchedulerControlResult>;
};

export type RecoverySchedulerControlAuditWriter = {
  createPending(
    input: {
      command:
        RecoveryAwareSchedulerControlRequest["command"];

      requestKey:
        string | null;
    },
  ): Promise<{
    publicId:
      string;
  }>;

  complete(
    publicId:
      string,

    result:
      RecoveryAwareSchedulerControlResult,
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

export class AuditedRecoverySchedulerControlExecutor
implements RecoverySchedulerControlCommandExecutor {
  public constructor(
    private readonly inner:
      RecoverySchedulerControlCommandExecutor,

    private readonly audit:
      RecoverySchedulerControlAuditWriter,
  ) {}

  public async execute(
    request:
      RecoveryAwareSchedulerControlRequest,
  ): Promise<RecoveryAwareSchedulerControlResult> {
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
      RecoveryAwareSchedulerControlResult;

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
        // Preserve the original command failure.
      }

      throw error;
    }

    await this.audit.complete(
      pending.publicId,
      result,
    );

    return result;
  }
}
