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

  readonly observedAtOrAfter?:
    string;

  readonly observedBefore?:
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

function parseUtcTimestamp(
  raw:
    string |
    undefined,

  field:
    "observedAtOrAfter" |
    "observedBefore",
):
  Date |
  undefined {

  if (raw === undefined) {
    return undefined;
  }


  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      raw,
    )
  ) {

    throw new Error(
      `Durable admission history ${field} must be a canonical UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ form.`,
    );
  }


  const value =
    new Date(
      raw,
    );


  if (
    !Number.isFinite(
      value.getTime(),
    ) ||
    value.toISOString() !==
      raw
  ) {

    throw new Error(
      `Durable admission history ${field} must be a valid canonical UTC timestamp.`,
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


        let observedAtOrAfter:
          Date |
          undefined;


        let observedBefore:
          Date |
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

          observedAtOrAfter =
            parseUtcTimestamp(
              request.query.observedAtOrAfter,
              "observedAtOrAfter",
            );
        }
        catch (error) {

          return reply
            .code(
              400,
            )
            .send({
              error:
                "invalid_durable_history_observed_at_or_after",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid durable history observedAtOrAfter.",
            });
        }


        try {

          observedBefore =
            parseUtcTimestamp(
              request.query.observedBefore,
              "observedBefore",
            );
        }
        catch (error) {

          return reply
            .code(
              400,
            )
            .send({
              error:
                "invalid_durable_history_observed_before",

              message:
                error instanceof Error
                  ? error.message
                  : "Invalid durable history observedBefore.",
            });
        }

        if (
          observedAtOrAfter !== undefined &&
          observedBefore !== undefined &&
          observedAtOrAfter.getTime() >=
            observedBefore.getTime()
        ) {

          return reply
            .code(
              400,
            )
            .send({
              error:
                "invalid_durable_history_temporal_window",

              message:
                "Durable admission history temporal window must satisfy observedAtOrAfter < observedBefore.",
            });
        }

        try {

          const snapshot =
            observedAtOrAfter !== undefined ||
            observedBefore !== undefined
              ? await service.getSnapshot({
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

                  ...(
                    command === undefined
                      ? {}
                      : {
                          command,
                        }
                  ),

                  ...(
                    observedAtOrAfter === undefined
                      ? {}
                      : {
                          observedAtOrAfter,
                        }
                  ),

                  ...(
                    observedBefore === undefined
                      ? {}
                      : {
                          observedBefore,
                        }
                  ),
                })
              : command === undefined
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
