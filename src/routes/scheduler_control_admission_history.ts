import type {
  FastifyInstance,
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerControlAdmissionHistoryStatusService,
} from "../recovery/scheduler_control_admission_history_status_service.js";


export type SchedulerControlAdmissionHistoryResponse = {
  readonly observedAtUtc:
    string;

  readonly capacity:
    number;

  readonly size:
    number;

  readonly dropped:
    number;

  readonly hasEvents:
    boolean;

  readonly events:
    readonly {
      readonly sequence:
        number;

      readonly observedAtUtc:
        string;

      readonly disposition:
        "admitted" |
        "denied";

      readonly command:
        "start" |
        "stop" |
        "restart";

      readonly reason:
        "scheduler_standby" |
        "scheduler_fail_closed" |
        "scheduler_stopped" |
        null;
    }[];
};


function projectResponse(
  service:
    SchedulerControlAdmissionHistoryStatusService,
): SchedulerControlAdmissionHistoryResponse {

  const status =
    service.getStatus();


  return {
    observedAtUtc:
      status.observedAtUtc.toISOString(),

    capacity:
      status.capacity,

    size:
      status.size,

    dropped:
      status.dropped,

    hasEvents:
      status.hasEvents,

    events:
      status.events.map(
        (event) => ({
          sequence:
            event.sequence,

          observedAtUtc:
            event.observedAtUtc.toISOString(),

          disposition:
            event.disposition,

          command:
            event.command,

          reason:
            event.reason,
        }),
      ),
  };
}


export function createSchedulerControlAdmissionHistoryRoutes(
  service:
    SchedulerControlAdmissionHistoryStatusService,
): FastifyPluginAsync {

  return async function schedulerControlAdmissionHistoryRoutes(
    app:
      FastifyInstance,
  ): Promise<void> {

    app.get(
      "/operations/scheduler/control-admission/history",

      async () =>
        projectResponse(
          service,
        ),
    );
  };
}
