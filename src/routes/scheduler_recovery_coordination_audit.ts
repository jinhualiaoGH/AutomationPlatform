import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerRecoveryCoordinationAuditRecord,
} from "../repositories/scheduler_recovery_coordination_audit_repository.js";


export type SchedulerRecoveryCoordinationAuditReader = {
  listRecent(
    limit:
      number,
  ):
    Promise<
      SchedulerRecoveryCoordinationAuditRecord[]
    >;
};


type CoordinationAuditQuery = {
  limit?:
    string;
};


function parseLimit(
  value:
    string | undefined,
): number {

  if (value === undefined) {
    return 50;
  }


  if (!/^[0-9]+$/.test(value)) {
    throw new Error(
      "limit must be an integer from 1 through 100.",
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
      "limit must be an integer from 1 through 100.",
    );
  }


  return limit;
}


export function createSchedulerRecoveryCoordinationAuditRoutes(
  history:
    SchedulerRecoveryCoordinationAuditReader,
): FastifyPluginAsync {

  return async function schedulerRecoveryCoordinationAuditRoutes(
    app,
  ): Promise<void> {

    app.get<{
      Querystring:
        CoordinationAuditQuery;
    }>(
      "/operations/scheduler/recovery-coordination",

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
            .code(
              400,
            )
            .send({
              error:
                "invalid_scheduler_recovery_coordination_audit_request",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid coordination audit request.",
            });
        }


        try {

          const items =
            await history.listRecent(
              limit,
            );


          return reply
            .code(
              200,
            )
            .send({
              count:
                items.length,

              items,
            });
        }
        catch (error) {

          app.log.error(
            error,
            "Unable to read scheduler recovery coordination audit",
          );


          return reply
            .code(
              500,
            )
            .send({
              error:
                "scheduler_recovery_coordination_audit_error",

              message:
                "Unable to read scheduler recovery coordination audit.",
            });
        }
      },
    );
  };
}
