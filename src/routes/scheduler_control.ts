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

export type SchedulerControlExecutor = {
  execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult>;
};

export type SchedulerControlRequestBody = {
  command?:
    unknown;

  requestKey?:
    unknown;
};

export type SchedulerControlResponse = {
  command:
    SchedulerControlResult["command"];

  disposition:
    SchedulerControlResult["disposition"];

  previousState:
    SchedulerControlResult["previousState"];

  currentState:
    SchedulerControlResult["currentState"];

  changed:
    boolean;

  reason:
    string | null;
};

export type SchedulerControlValidationErrorResponse = {
  error:
    "invalid_scheduler_control_request";

  message:
    string;
};

export type SchedulerControlErrorResponse = {
  error:
    "scheduler_control_error";

  message:
    string;
};

function parseCommand(
  value:
    unknown,
): SchedulerControlCommand {
  if (
    value === "start" ||
    value === "stop"
  ) {
    return value;
  }

  throw new Error(
    'command must be either "start" or "stop".',
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
    SchedulerControlRequestBody |
    null |
    undefined,
): SchedulerControlRequest {
  if (
    body === null ||
    body === undefined ||
    typeof body !== "object"
  ) {
    throw new Error(
      "request body must be a JSON object.",
    );
  }

  return {
    command:
      parseCommand(
        body.command,
      ),

    requestKey:
      parseRequestKey(
        body.requestKey,
      ),
  };
}

function serializeResult(
  result:
    SchedulerControlResult,
): SchedulerControlResponse {
  return {
    command:
      result.command,

    disposition:
      result.disposition,

    previousState:
      result.previousState,

    currentState:
      result.currentState,

    changed:
      result.changed,

    reason:
      result.reason,
  };
}

function validationError(
  message:
    string,
): SchedulerControlValidationErrorResponse {
  return {
    error:
      "invalid_scheduler_control_request",

    message,
  };
}

function executionError():
  SchedulerControlErrorResponse {
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

export function createSchedulerControlRoutes(
  control:
    SchedulerControlExecutor,
): FastifyPluginAsync {
  return async function schedulerControlRoutes(
    app,
  ): Promise<void> {
    app.post<{
      Body:
        SchedulerControlRequestBody;
    }>(
      "/operations/scheduler/commands",
      async (
        request,
        reply,
      ) => {
        let command:
          SchedulerControlRequest;

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
          SchedulerControlResult;

        try {
          result =
            await control.execute(
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

        const response =
          serializeResult(
            result,
          );

        if (
          result.disposition ===
          "rejected"
        ) {
          return reply
            .code(409)
            .send(
              response,
            );
        }

        return reply
          .code(200)
          .send(
            response,
          );
      },
    );
  };
}
