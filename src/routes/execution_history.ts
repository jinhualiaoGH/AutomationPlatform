import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  ExecutionHistoryItem,
  ExecutionHistoryResult,
} from "../operations/execution_history_service.js";

export type ExecutionHistoryReader = {
  getRecent(
    limit?: number,
  ): Promise<ExecutionHistoryResult>;

  getRecentForAutomation(
    automationId: bigint,
    limit?: number,
  ): Promise<ExecutionHistoryResult>;

  getRecentFailures(
    limit?: number,
  ): Promise<ExecutionHistoryResult>;
};

export type ExecutionHistoryItemResponse = {
  publicId:
    string;

  automationId:
    string;

  triggerId:
    string | null;

  status:
    ExecutionHistoryItem["status"];

  requestedAtUtc:
    string;

  startedAtUtc:
    string | null;

  completedAtUtc:
    string | null;

  durationMilliseconds:
    number | null;

  errorMessage:
    string | null;

  hasFailure:
    boolean;
};

export type ExecutionHistoryResponse = {
  count:
    number;

  items:
    ExecutionHistoryItemResponse[];
};

export type ExecutionHistoryErrorResponse = {
  error:
    "execution_history_error";

  message:
    string;
};

export type ExecutionHistoryValidationErrorResponse = {
  error:
    "invalid_execution_history_request";

  message:
    string;
};

const defaultLimit =
  50;

const maximumLimit =
  200;

function parseLimit(
  raw:
    string | undefined,
): number {
  if (raw === undefined) {
    return defaultLimit;
  }

  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(
      "limit must be an integer from 1 through 200.",
    );
  }

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximumLimit
  ) {
    throw new Error(
      "limit must be an integer from 1 through 200.",
    );
  }

  return value;
}

function parseAutomationId(
  raw:
    string,
): bigint {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(
      "automationId must be a positive integer.",
    );
  }

  return BigInt(
    raw,
  );
}

function serializeItem(
  item:
    ExecutionHistoryItem,
): ExecutionHistoryItemResponse {
  return {
    publicId:
      item.publicId,

    automationId:
      item.automationId.toString(),

    triggerId:
      item.triggerId === null
        ? null
        : item.triggerId.toString(),

    status:
      item.status,

    requestedAtUtc:
      item.requestedAtUtc
        .toISOString(),

    startedAtUtc:
      item.startedAtUtc
        ?.toISOString() ??
      null,

    completedAtUtc:
      item.completedAtUtc
        ?.toISOString() ??
      null,

    durationMilliseconds:
      item.durationMilliseconds,

    errorMessage:
      item.errorMessage,

    hasFailure:
      item.hasFailure,
  };
}

function serializeResult(
  result:
    ExecutionHistoryResult,
): ExecutionHistoryResponse {
  return {
    count:
      result.count,

    items:
      result.items.map(
        serializeItem,
      ),
  };
}

function validationResponse(
  message:
    string,
): ExecutionHistoryValidationErrorResponse {
  return {
    error:
      "invalid_execution_history_request",

    message,
  };
}

function serverErrorResponse():
  ExecutionHistoryErrorResponse {
  return {
    error:
      "execution_history_error",

    message:
      "Unable to read execution history.",
  };
}

function errorMessage(
  error:
    unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Invalid execution history request.";
}

export function createExecutionHistoryRoutes(
  history:
    ExecutionHistoryReader,
): FastifyPluginAsync {
  return async function executionHistoryRoutes(
    app,
  ): Promise<void> {

    app.get<{
      Querystring: {
        limit?: string;
      };
    }>(
      "/operations/executions",
      async (
        request,
        reply,
      ) => {
        let limit:
          number;

        try {
          limit =
            parseLimit(
              request.query.limit,
            );
        }
        catch (error) {
          return reply
            .code(400)
            .send(
              validationResponse(
                errorMessage(
                  error,
                ),
              ),
            );
        }

        try {
          const result =
            await history.getRecent(
              limit,
            );

          return reply.send(
            serializeResult(
              result,
            ),
          );
        }
        catch (error) {
          app.log.error(
            error,
            "Unable to read recent execution history",
          );

          return reply
            .code(500)
            .send(
              serverErrorResponse(),
            );
        }
      },
    );

    app.get<{
      Querystring: {
        limit?: string;
      };
    }>(
      "/operations/executions/failures",
      async (
        request,
        reply,
      ) => {
        let limit:
          number;

        try {
          limit =
            parseLimit(
              request.query.limit,
            );
        }
        catch (error) {
          return reply
            .code(400)
            .send(
              validationResponse(
                errorMessage(
                  error,
                ),
              ),
            );
        }

        try {
          const result =
            await history
              .getRecentFailures(
                limit,
              );

          return reply.send(
            serializeResult(
              result,
            ),
          );
        }
        catch (error) {
          app.log.error(
            error,
            "Unable to read recent execution failures",
          );

          return reply
            .code(500)
            .send(
              serverErrorResponse(),
            );
        }
      },
    );

    app.get<{
      Params: {
        automationId: string;
      };

      Querystring: {
        limit?: string;
      };
    }>(
      "/operations/automations/:automationId/executions",
      async (
        request,
        reply,
      ) => {
        let automationId:
          bigint;

        let limit:
          number;

        try {
          automationId =
            parseAutomationId(
              request.params
                .automationId,
            );

          limit =
            parseLimit(
              request.query.limit,
            );
        }
        catch (error) {
          return reply
            .code(400)
            .send(
              validationResponse(
                errorMessage(
                  error,
                ),
              ),
            );
        }

        try {
          const result =
            await history
              .getRecentForAutomation(
                automationId,
                limit,
              );

          return reply.send(
            serializeResult(
              result,
            ),
          );
        }
        catch (error) {
          app.log.error(
            error,
            "Unable to read automation execution history",
          );

          return reply
            .code(500)
            .send(
              serverErrorResponse(),
            );
        }
      },
    );
  };
}
