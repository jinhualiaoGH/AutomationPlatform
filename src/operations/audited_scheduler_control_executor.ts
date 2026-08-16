import type {
  SchedulerControlRequest,
} from "./scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "./scheduler_control_service.js";

export type SchedulerControlCommandExecutor = {
  execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult>;
};

export type SchedulerControlAuditWriter = {
  createPending(
    input: {
      command:
        SchedulerControlRequest["command"];

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
      SchedulerControlResult,
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

export class AuditedSchedulerControlExecutor
implements SchedulerControlCommandExecutor {
  public constructor(
    private readonly inner:
      SchedulerControlCommandExecutor,

    private readonly audit:
      SchedulerControlAuditWriter,
  ) {}

  public async execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult> {
    const intent =
      await this.audit.createPending({
        command:
          request.command,

        requestKey:
          request.requestKey ??
          null,
      });

    try {
      const result =
        await this.inner.execute(
          request,
        );

      await this.audit.complete(
        intent.publicId,
        result,
      );

      return result;
    }
    catch (error) {
      try {
        await this.audit.fail(
          intent.publicId,
          errorMessageFrom(
            error,
          ),
        );
      }
      catch {
        // Preserve the original control failure.
      }

      throw error;
    }
  }
}
