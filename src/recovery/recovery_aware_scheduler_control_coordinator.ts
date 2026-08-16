import type {
  RecoveryAwareSchedulerControlCommand,
  RecoveryAwareSchedulerControlResult,
} from "./recovery_aware_scheduler_control_service.js";

export type RecoveryAwareSchedulerControlHandler = {
  execute(
    command:
      RecoveryAwareSchedulerControlCommand,
  ): Promise<RecoveryAwareSchedulerControlResult>;
};

export type RecoveryAwareSchedulerControlRequest = {
  command:
    RecoveryAwareSchedulerControlCommand;

  requestKey?:
    string;
};

function normalizeRequestKey(
  requestKey:
    string | undefined,
): string | null {
  if (requestKey === undefined) {
    return null;
  }

  const normalized =
    requestKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      "requestKey must not be empty.",
    );
  }

  if (normalized.length > 128) {
    throw new Error(
      "requestKey must not exceed 128 characters.",
    );
  }

  return normalized;
}

export class RecoveryAwareSchedulerControlCoordinator {
  private tail:
    Promise<void> =
    Promise.resolve();

  private readonly requests =
    new Map<
      string,
      Promise<RecoveryAwareSchedulerControlResult>
    >();

  public constructor(
    private readonly handler:
      RecoveryAwareSchedulerControlHandler,
  ) {}

  public execute(
    request:
      RecoveryAwareSchedulerControlRequest,
  ): Promise<RecoveryAwareSchedulerControlResult> {
    let requestKey:
      string | null;

    try {
      requestKey =
        normalizeRequestKey(
          request.requestKey,
        );
    }
    catch (error) {
      return Promise.reject(
        error,
      );
    }

    if (requestKey !== null) {
      const existing =
        this.requests.get(
          requestKey,
        );

      if (existing) {
        return existing;
      }
    }

    const execution =
      this.tail.then(
        () =>
          this.handler.execute(
            request.command,
          ),
      );

    this.tail =
      execution.then(
        () => undefined,
        () => undefined,
      );

    if (requestKey !== null) {
      this.requests.set(
        requestKey,
        execution,
      );
    }

    return execution;
  }
}
