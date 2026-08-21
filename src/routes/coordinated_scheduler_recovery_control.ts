import type {
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";

import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "../recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "../recovery/readiness_aware_coordinated_control_executor.js";

import {
  mapSchedulerControlAdmissionHttpResponse,
} from "../recovery/scheduler_control_admission_http.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../recovery/coordinated_recovery_aware_scheduler_control_service.js";


export type CoordinatedSchedulerRecoveryHttpExecutor = {
  execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
    Promise<
      ReadinessAwareCoordinatedSchedulerControlResult
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

    const executeRequest =
      async (
        body:
          CoordinatedSchedulerRecoveryRequestBody |
          null |
          undefined,

        reply:
          FastifyReply,
      ): Promise<FastifyReply> => {

        let command:
          CoordinatedRecoveryAwareSchedulerControlRequest;


        try {

          command =
            parseRequest(
              body,
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
          ReadinessAwareCoordinatedSchedulerControlResult;


        try {

          result =
            await control.execute(
              command,
            );


          const admissionHttp =
            mapSchedulerControlAdmissionHttpResponse(
              result,
            );


          if (admissionHttp) {

            return reply
              .code(
                admissionHttp.statusCode,
              )
              .send(
                admissionHttp.body,
              );
          }
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


        /*
         * Admission-denied results returned above never reach
         * frozen coordinated serialization.
         */
        const frozenResult =
          result as
            CoordinatedRecoveryAwareSchedulerControlResult;


        const response =
          serializeResult(
            frozenResult,
          );


        /*
         * Existing rejected semantics remain HTTP 409.
         *
         * A superseded cross-process contender is also a
         * conflict, but is never reported as HTTP 500.
         */
        if (
          frozenResult.disposition ===
            "rejected" ||
          frozenResult.disposition ===
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
      };


    app.post<{
      Body:
        CoordinatedSchedulerRecoveryRequestBody;
    }>(
      "/operations/scheduler/commands",

      async (
        request,
        reply,
      ) =>
        executeRequest(
          request.body,
          reply,
        ),
    );


    const executeDedicatedRequest =
      async (
        dedicatedCommand:
          "start" |
          "stop" |
          "restart",

        body:
          unknown,

        reply:
          FastifyReply,
      ): Promise<FastifyReply> => {

        if (
          body !== undefined &&
          (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(
              body,
            )
          )
        ) {

          return executeRequest(
            body as
              CoordinatedSchedulerRecoveryRequestBody |
              null |
              undefined,
            reply,
          );
        }


        const requestBody:
          CoordinatedSchedulerRecoveryRequestBody = {
            ...(
              body === undefined
                ? {}
                : body as
                  CoordinatedSchedulerRecoveryRequestBody
            ),

            command:
              dedicatedCommand,
          };


        return executeRequest(
          requestBody,
          reply,
        );
      };


    app.post<{
      Body:
        unknown;
    }>(
      "/operations/scheduler/start",

      async (
        request,
        reply,
      ) =>
        executeDedicatedRequest(
          "start",
          request.body,
          reply,
        ),
    );


    app.post<{
      Body:
        unknown;
    }>(
      "/operations/scheduler/stop",

      async (
        request,
        reply,
      ) =>
        executeDedicatedRequest(
          "stop",
          request.body,
          reply,
        ),
    );


    app.post<{
      Body:
        unknown;
    }>(
      "/operations/scheduler/restart",

      async (
        request,
        reply,
      ) =>
        executeDedicatedRequest(
          "restart",
          request.body,
          reply,
        ),
    );
  };
}
