import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "../recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../recovery/coordinated_recovery_aware_scheduler_control_service.js";


export type CoordinatedSchedulerRecoveryHttpExecutor = {
  execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<
      CoordinatedRecoveryAwareSchedulerControlResult
    >;
};


export type CoordinatedSchedulerRecoveryRequestBody = {
  command?:
    unknown;

  requestKey?:
    unknown;
};


export type SchedulerSupersededHttpResponse = {
  readonly command:
    "restart";

  readonly disposition:
    "superseded";

  readonly attemptedGeneration:
    number;

  readonly observedGeneration:
    number;

  readonly changed:
    false;

  readonly reason:
    "Superseded by a later durable scheduler generation.";
};


export type CoordinatedSchedulerValidationErrorResponse = {
  readonly error:
    "invalid_scheduler_control_request";

  readonly message:
    string;
};


export type CoordinatedSchedulerExecutionErrorResponse = {
  readonly error:
    "scheduler_control_error";

  readonly message:
    "Unable to execute scheduler control command.";
};


function parseCommand(
  value:
    unknown,
):
  "start" |
  "stop" |
  "restart" {

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
    CoordinatedSchedulerRecoveryRequestBody |
    null |
    undefined,
): CoordinatedRecoveryAwareSchedulerControlRequest {

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


function validationError(
  error:
    unknown,
): CoordinatedSchedulerValidationErrorResponse {

  return {
    error:
      "invalid_scheduler_control_request",

    message:
      error instanceof Error
        ? error.message
        : "Invalid scheduler control request.",
  };
}


function executionError():
  CoordinatedSchedulerExecutionErrorResponse {

  return {
    error:
      "scheduler_control_error",

    message:
      "Unable to execute scheduler control command.",
  };
}


/*
 * A11 restarted is an internal coordination envelope.
 *
 * HTTP intentionally unwraps its frozen A9 restart result so
 * successful restart remains wire-compatible with A9/A10.
 */
function serializeResult(
  result:
    CoordinatedRecoveryAwareSchedulerControlResult,
):
  CoordinatedRecoveryAwareSchedulerControlResult |
  SchedulerSupersededHttpResponse {

  if (
    result.disposition ===
    "superseded"
  ) {
    return {
      command:
        "restart",

      disposition:
        "superseded",

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
    result.disposition ===
    "restarted"
  ) {
    return result.result;
  }


  return result;
}


export function createCoordinatedSchedulerRecoveryControlRoutes(
  control:
    CoordinatedSchedulerRecoveryHttpExecutor,
): FastifyPluginAsync {

  return async function coordinatedSchedulerRecoveryControlRoutes(
    app,
  ): Promise<void> {

    app.post<{
      Body:
        CoordinatedSchedulerRecoveryRequestBody;
    }>(
      "/operations/scheduler/commands",

      async (
        request,
        reply,
      ) => {

        let command:
          CoordinatedRecoveryAwareSchedulerControlRequest;


        try {

          command =
            parseRequest(
              request.body,
            );
        }
        catch (error) {

          return reply
            .code(
              400,
            )
            .send(
              validationError(
                error,
              ),
            );
        }


        let result:
          CoordinatedRecoveryAwareSchedulerControlResult;


        try {

          result =
            await control.execute(
              command,
            );
        }
        catch (error) {

          app.log.error(
            error,
            "Unable to execute coordinated scheduler control command",
          );


          return reply
            .code(
              500,
            )
            .send(
              executionError(),
            );
        }


        const response =
          serializeResult(
            result,
          );


        /*
         * Existing rejected semantics remain HTTP 409.
         *
         * A superseded cross-process contender is also a
         * conflict, but is never reported as HTTP 500.
         */
        if (
          result.disposition ===
            "rejected" ||
          result.disposition ===
            "superseded"
        ) {
          return reply
            .code(
              409,
            )
            .send(
              response,
            );
        }


        return reply
          .code(
            200,
          )
          .send(
            response,
          );
      },
    );
  };
}
