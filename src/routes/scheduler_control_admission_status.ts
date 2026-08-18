import type {
  FastifyInstance,
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerControlAdmissionStatusService,
} from "../recovery/scheduler_control_admission_status_service.js";


export type SchedulerControlAdmissionStatusResponse = {
  readonly observedAtUtc:
    string;

  readonly hasObservedDecisions:
    boolean;

  readonly metrics: {
    readonly total:
      number;

    readonly admitted:
      number;

    readonly denied:
      number;

    readonly byCommand: {
      readonly start:
        number;

      readonly stop:
        number;

      readonly restart:
        number;
    };

    readonly deniedByReason: {
      readonly scheduler_standby:
        number;

      readonly scheduler_fail_closed:
        number;

      readonly scheduler_stopped:
        number;
    };

    readonly lastDecision:
      | {
          readonly disposition:
            "admitted";

          readonly command:
            "start" |
            "stop" |
            "restart";

          readonly reason:
            null;
        }
      | {
          readonly disposition:
            "denied";

          readonly command:
            "start" |
            "stop" |
            "restart";

          readonly reason:
            "scheduler_standby" |
            "scheduler_fail_closed" |
            "scheduler_stopped";
        }
      | null;
  };
};


function projectResponse(
  service:
    SchedulerControlAdmissionStatusService,
): SchedulerControlAdmissionStatusResponse {

  const status =
    service.getStatus();


  return {
    observedAtUtc:
      status.observedAtUtc.toISOString(),

    hasObservedDecisions:
      status.hasObservedDecisions,

    metrics: {
      total:
        status.metrics.total,

      admitted:
        status.metrics.admitted,

      denied:
        status.metrics.denied,

      byCommand: {
        ...status.metrics.byCommand,
      },

      deniedByReason: {
        ...status.metrics.deniedByReason,
      },

      lastDecision:
        status.metrics.lastDecision === null
          ? null
          : {
              ...status.metrics.lastDecision,
            },
    },
  };
}


export function createSchedulerControlAdmissionStatusRoutes(
  service:
    SchedulerControlAdmissionStatusService,
): FastifyPluginAsync {

  return async function schedulerControlAdmissionStatusRoutes(
    app:
      FastifyInstance,
  ): Promise<void> {

    app.get(
      "/operations/scheduler/control-admission/status",

      async () =>
        projectResponse(
          service,
        ),
    );
  };
}
