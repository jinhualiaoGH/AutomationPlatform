import type {
  CoordinatedRecoveryAwareSchedulerControlCommand,
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "./coordinated_recovery_aware_scheduler_control_service.js";


export type CoordinatedRecoveryAwareSchedulerControlHandler = {
  execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ): Promise<CoordinatedRecoveryAwareSchedulerControlResult>;
};


export type CoordinatedRecoveryAwareSchedulerControlRequest = {
  command:
    CoordinatedRecoveryAwareSchedulerControlCommand;

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


/*
 * A11.7 preserves the frozen A9 coordinator semantics:
 *
 * - commands are serialized within one process;
 * - request keys deduplicate both in-flight and completed work;
 * - failed keyed requests remain idempotent;
 * - unkeyed commands are never deduplicated;
 * - queue failure never poisons subsequent commands.
 *
 * Only the result domain is widened to include A11
 * restarted/superseded recovery outcomes.
 */
export class CoordinatedRecoveryAwareSchedulerControlCoordinator {
  private tail:
    Promise<void> =
    Promise.resolve();


  private readonly requests =
    new Map<
      string,
      Promise<CoordinatedRecoveryAwareSchedulerControlResult>
    >();


  public constructor(
    private readonly handler:
      CoordinatedRecoveryAwareSchedulerControlHandler,
  ) {}


  public execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ): Promise<CoordinatedRecoveryAwareSchedulerControlResult> {

    const requestKey =
      normalizeRequestKey(
        request.requestKey,
      );


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
      this.enqueue(
        request.command,
      );


    if (requestKey !== null) {

      /*
       * Preserve both fulfilled and rejected promises.
       *
       * This is deliberate request-key idempotency:
       * repeating a failed request returns the same failure
       * rather than executing the command again.
       */
      this.requests.set(
        requestKey,
        execution,
      );
    }


    return execution;
  }


  private enqueue(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ): Promise<CoordinatedRecoveryAwareSchedulerControlResult> {

    const execution =
      this.tail
        .then(
          () =>
            this.handler.execute(
              command,
            ),
        );


    /*
     * tail is intentionally normalized to Promise<void>.
     *
     * A command failure must reject that command's promise,
     * but must not poison the queue for commands submitted
     * afterward.
     */
    this.tail =
      execution
        .then(
          () =>
            undefined,
          () =>
            undefined,
        );


    return execution;
  }
}
