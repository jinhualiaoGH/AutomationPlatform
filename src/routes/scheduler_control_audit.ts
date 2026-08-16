import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerControlAuditHistory,
} from "../operations/scheduler_control_audit_service.js";

export type SchedulerControlAuditHistoryReader = {
  getRecent(
    limit:
      number,
  ): Promise<SchedulerControlAuditHistory>;
};

type AuditHistoryQuery = {
  limit?:
    string;
};

type AuditHistoryError = {
  error:
    "invalid_scheduler_control_audit_request";

  message:
    string;
};

function parseLimit(
  value:
    string | undefined,
): number {
  if (value === undefined) {
    return 50;
  }

  if (
    !/^[0-9]+$/.test(
      value,
    )
  ) {
    throw new Error(
      "limit must be an integer from 1 to 100.",
    );
  }

  const limit =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      limit,
    ) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error(
      "limit must be an integer from 1 to 100.",
    );
  }

  return limit;
}

function validationError(
  message:
    string,
): AuditHistoryError {
  return {
    error:
      "invalid_scheduler_control_audit_request",

    message,
  };
}

export function createSchedulerControlAuditRoutes(
  history:
    SchedulerControlAuditHistoryReader,
): FastifyPluginAsync {
  return async function schedulerControlAuditRoutes(
    app,
  ): Promise<void> {
    app.get<{
      Querystring:
        AuditHistoryQuery;
    }>(
      "/operations/scheduler/commands",
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
              validationError(
                error instanceof Error
                  ? error.message
                  : "Invalid audit history request.",
              ),
            );
        }

        const result =
          await history.getRecent(
            limit,
          );

        return reply
          .code(200)
          .send(
            result,
          );
      },
    );
  };
}
