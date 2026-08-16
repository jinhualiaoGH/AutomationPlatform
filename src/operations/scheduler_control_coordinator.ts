import type {
  SchedulerControlCommand,
  SchedulerControlResult,
} from "./scheduler_control_service.js";

export type SchedulerControlHandler = {
  start():
    SchedulerControlResult;

  stop():
    Promise<SchedulerControlResult>;
};

export type SchedulerControlRequest = {
  command:
    SchedulerControlCommand;

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

export class SchedulerControlCoordinator {
  private tail:
    Promise<void> =
    Promise.resolve();

  private readonly requests =
    new Map<
      string,
      Promise<SchedulerControlResult>
    >();

  public constructor(
    private readonly handler:
      SchedulerControlHandler,
  ) {}

  public execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult> {
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

    const operation =
      this.enqueue(
        request.command,
      );

    if (requestKey !== null) {
      this.requests.set(
        requestKey,
        operation,
      );
    }

    return operation;
  }

  private enqueue(
    command:
      SchedulerControlCommand,
  ): Promise<SchedulerControlResult> {
    const operation =
      this.tail.then(
        () =>
          this.executeCommand(
            command,
          ),
      );

    this.tail =
      operation.then(
        () => undefined,
        () => undefined,
      );

    return operation;
  }

  private executeCommand(
    command:
      SchedulerControlCommand,
  ): Promise<SchedulerControlResult> {
    switch (command) {
      case "start":
        return Promise.resolve(
          this.handler.start(),
        );

      case "stop":
        return this.handler.stop();
    }
  }
}
