import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerControlRequest,
} from "../operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlCommand,
  SchedulerControlResult,
} from "../operations/scheduler_control_service.js";

import type {
  RecoveryAwareSchedulerControlRequest,
} from "../recovery/recovery_aware_scheduler_control_coordinator.js";

import type {
  RecoveryAwareSchedulerControlResult,
} from "../recovery/recovery_aware_scheduler_control_service.js";


export type RecoverySchedulerHttpCommand =
  SchedulerControlCommand |
  "restart";


export type RecoverySchedulerHttpRequest =
  | SchedulerControlRequest
  | {
      command:
        "restart";

      requestKey?:
        string;
    };


export type RecoverySchedulerHttpResult =
  SchedulerControlResult |
  RecoveryAwareSchedulerControlResult;


export type FrozenSchedulerControlExecutor = {
  execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult>;
};


export type RecoverySchedulerControlExecutor = {
  execute(
    request:
      RecoveryAwareSchedulerControlRequest,
  ): Promise<RecoveryAwareSchedulerControlResult>;
};


export class SchedulerRecoveryHttpGateway {
  public constructor(
    private readonly frozenControl:
      FrozenSchedulerControlExecutor,

    private readonly recoveryControl:
      RecoverySchedulerControlExecutor,
  ) {}

  public execute(
    request:
      RecoverySchedulerHttpRequest,
  ): Promise<RecoverySchedulerHttpResult> {
    if (request.command === "restart") {
      return this.recoveryControl.execute(
        request,
      );
    }

    return this.frozenControl.execute(
      request,
    );
  }
}


export type SchedulerRecoveryControlRequestBody = {
  command?:
    unknown;

  requestKey?:
    unknown;
};


export type SchedulerRecoveryControlValidationErrorResponse = {
  error:
    "invalid_scheduler_control_request";

  message:
    string;
};


export type SchedulerRecoveryControlErrorResponse = {
  error:
    "scheduler_control_error";

  message:
    string;
};


function parseCommand(
  value:
    unknown,
): RecoverySchedulerHttpCommand {
  if (
    value === "start" ||
    value === "stop" ||
    value === "restart"
  ) {
    return value;
  }

  throw new Error(
    'command must be "start", "stop", or "restart".',
  );
}


function parseRequestKey(
  value:
    unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(
      "requestKey must be a string when provided.",
    );
  }

  const normalized =
    value.trim();

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


function parseRequest(
  body:
    SchedulerRecoveryControlRequestBody |
    null |
    undefined,
): RecoverySchedulerHttpRequest {
  if (
    body === null ||
    body === undefined ||
    typeof body !== "object"
  ) {
    throw new Error(
      "request body must be a JSON object.",
    );
  }

  const command =
    parseCommand(
      body.command,
    );

  const requestKey =
    parseRequestKey(
      body.requestKey,
    );

  if (command === "restart") {
    return {
      command:
        "restart",

      requestKey,
    };
  }

  return {
    command,
    requestKey,
  };
}


function validationError(
  message:
    string,
): SchedulerRecoveryControlValidationErrorResponse {
  return {
    error:
      "invalid_scheduler_control_request",

    message,
  };
}


function executionError():
  SchedulerRecoveryControlErrorResponse {
  return {
    error:
      "scheduler_control_error",

    message:
      "Unable to execute scheduler control command.",
  };
}


function messageFrom(
  error:
    unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Invalid scheduler control request.";
}


export function createSchedulerRecoveryControlRoutes(
  gateway:
    SchedulerRecoveryHttpGateway,
): FastifyPluginAsync {
  return async function schedulerRecoveryControlRoutes(
    app,
  ): Promise<void> {
    app.post<{
      Body:
        SchedulerRecoveryControlRequestBody;
    }>(
      "/operations/scheduler/commands",
      async (
        request,
        reply,
      ) => {
        let command:
          RecoverySchedulerHttpRequest;

        try {
          command =
            parseRequest(
              request.body,
            );
        }
        catch (error) {
          return reply
            .code(400)
            .send(
              validationError(
                messageFrom(
                  error,
                ),
              ),
            );
        }

        let result:
          RecoverySchedulerHttpResult;

        try {
          result =
            await gateway.execute(
              command,
            );
        }
        catch (error) {
          app.log.error(
            error,
            "Unable to execute scheduler control command",
          );

          return reply
            .code(500)
            .send(
              executionError(),
            );
        }

        if (
          result.disposition ===
          "rejected"
        ) {
          return reply
            .code(409)
            .send(
              result,
            );
        }

        return reply
          .code(200)
          .send(
            result,
          );
      },
    );
  };
}
