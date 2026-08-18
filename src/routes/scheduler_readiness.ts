import type {
  FastifyInstance,
} from "fastify";

import type {
  SchedulerFailoverReadiness,
} from "../recovery/scheduler_failover_readiness.js";

import type {
  SchedulerFailoverReadinessReader,
} from "../recovery/scheduler_failover_readiness_service.js";


export type SchedulerReadinessResponse =
  SchedulerFailoverReadiness;


export function createSchedulerReadinessRoutes(
  readiness:
    SchedulerFailoverReadinessReader,
) {

  return async function schedulerReadinessRoutes(
    app:
      FastifyInstance,
  ):
  Promise<void> {

    app.get(
      "/operations/scheduler/readiness",
      async (
        _request,
        reply,
      ) => {

        const snapshot =
          readiness.snapshot();


        return reply
          .code(200)
          .send(snapshot);
      },
    );
  };
}
