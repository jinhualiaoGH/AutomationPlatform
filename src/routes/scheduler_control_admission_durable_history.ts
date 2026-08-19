import {
  type FastifyInstance,
} from "fastify";

import type {
  SchedulerControlAdmissionCommand,
} from "../recovery/scheduler_control_admission.js";

import type {
  SchedulerControlAdmissionDurableHistoryService,
} from "../recovery/scheduler_control_admission_durable_history_service.js";


type DurableHistoryQuery = {
  readonly limit?:
    string;

  readonly beforeSequence?:
    string;

  readonly command?:
    string;
};


function parseLimit(
  raw:
    string |
    undefined,
):
  number |
  undefined {

  if (raw === undefined) {
    return undefined;
  }


  if (
    !/^[1-9][0-9]*$/.test(
      raw,
    )
  ) {

    throw new Error(
      "Durable admission history limit must be a positive safe integer.",
    );
  }


  const value =
    Number(
      raw,
    );


  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {

    throw new Error(
      "Durable admission history limit must be a positive safe integer.",
    );
  }


  return value;
}


function parseCommand(
  raw:
    string |
    undefined,
):
  SchedulerControlAdmissionCommand |
  undefined {

  if (raw === undefined) {
    return undefined;
  }


  if (
    raw !== "start" &&
    raw !== "stop" &&
    raw !== "restart"
  ) {

    throw new Error(
      "Durable admission history command must be start, stop, or restart.",
    );
  }


  return raw;
}


function parseBeforeSequence(
  raw:
    string |
    undefined,
):
  number |
  undefined {

  if (raw === undefined) {
    return undefined;
  }


  if (
    !/^[1-9][0-9]*$/.test(
      raw,
    )
  ) {

    throw new Error(
      "Durable admission history beforeSequence must be a positive safe integer.",
    );
  }


  const value =
    Number(
      raw,
    );


  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {

    throw new Error(
      "Durable admission history beforeSequence must be a positive safe integer.",
    );
  }


  return value;
}

export function createSchedulerControlAdmissionDurableHistoryRoutes(
  service:
    SchedulerControlAdmissionDurableHistoryService,
):
  (
    app:
      FastifyInstance,
  ) => Promise<void> {

  return async (
    app:
      FastifyInstance,
  ): Promise<void> => {

    app.get<{
      Querystring:
        DurableHistoryQuery;
    }>(
      "/operations/scheduler/control-admission/history/durable",

      async (
        request,
        reply,
      ) => {

        let limit:
          number |
          undefined;


        let beforeSequence:
          number |
          undefined;


        let command:
          SchedulerControlAdmissionCommand |
          undefined;


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
                "invalid_durable_history_limit",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid durable history limit.",
            });
        }


        try {

          beforeSequence =
            parseBeforeSequence(
              request.query.beforeSequence,
            );
        }
        catch (error) {

          return reply
            .code(
              400,
            )
            .send({
              error:
                "invalid_durable_history_before_sequence",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid durable history beforeSequence.",
            });
        }


        try {

          command =
            parseCommand(
              request.query.command,
            );
        }
        catch (error) {

          return reply
            .code(
              400,
            )
            .send({
              error:
                "invalid_durable_history_command",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid durable history command.",
            });
        }


        try {

          const snapshot =
            command === undefined
              ? (
                  beforeSequence === undefined
                    ? (
                        limit === undefined
                          ? await service.getSnapshot()
                          : await service.getSnapshot(
                              limit,
                            )
                      )
                    : await service.getSnapshot({
                        ...(
                          limit === undefined
                            ? {}
                            : {
                                limit,
                              }
                        ),

                        beforeSequence,
                      })
                )
              : await service.getSnapshot({
                  ...(
                    limit === undefined
                      ? {}
                      : {
                          limit,
                        }
                  ),

                  ...(
                    beforeSequence === undefined
                      ? {}
                      : {
                          beforeSequence,
                        }
                  ),

                  command,
                });


          return reply
            .code(
              200,
            )
            .send(
              snapshot,
            );
        }
        catch (error) {

          request.log.error(
            error,
            "Durable scheduler control admission history read failed.",
          );


          return reply
            .code(
              503,
            )
            .send({
              error:
                "durable_history_unavailable",

              message:
                "Durable scheduler control admission history is unavailable.",
            });
        }
      },
    );
  };
}
