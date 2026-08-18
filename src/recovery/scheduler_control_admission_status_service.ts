import {
  SchedulerControlAdmissionMetricsAccumulator,
  type SchedulerControlAdmissionMetricsSnapshot,
} from "./scheduler_control_admission_metrics.js";


export type SchedulerControlAdmissionStatusClock =
  () => Date;


export type SchedulerControlAdmissionOperationalStatus = {
  readonly observedAtUtc:
    Date;

  readonly hasObservedDecisions:
    boolean;

  readonly metrics:
    SchedulerControlAdmissionMetricsSnapshot;
};


function defaultClock():
  Date {

  return new Date();
}


function cloneDate(
  value:
    Date,
): Date {

  const milliseconds =
    value.getTime();


  if (!Number.isFinite(milliseconds)) {

    throw new Error(
      "Admission status clock returned an invalid Date.",
    );
  }


  return new Date(
    milliseconds,
  );
}


function cloneMetrics(
  snapshot:
    SchedulerControlAdmissionMetricsSnapshot,
): SchedulerControlAdmissionMetricsSnapshot {

  return {
    total:
      snapshot.total,

    admitted:
      snapshot.admitted,

    denied:
      snapshot.denied,

    byCommand: {
      ...snapshot.byCommand,
    },

    deniedByReason: {
      ...snapshot.deniedByReason,
    },

    lastDecision:
      snapshot.lastDecision === null
        ? null
        : {
            ...snapshot.lastDecision,
          },
  };
}


/**
 * Read-only operational projection over A18 admission metrics.
 *
 * This service deliberately owns no admission behavior and no
 * mutation path. It samples the accumulator at read time and
 * attaches a defensive observation timestamp.
 */
export class SchedulerControlAdmissionStatusService {

  public constructor(
    private readonly metrics:
      SchedulerControlAdmissionMetricsAccumulator,

    private readonly clock:
      SchedulerControlAdmissionStatusClock =
      defaultClock,
  ) {}


  public getStatus():
    SchedulerControlAdmissionOperationalStatus {

    const observedAtUtc =
      cloneDate(
        this.clock(),
      );


    const metrics =
      cloneMetrics(
        this.metrics.getSnapshot(),
      );


    return {
      observedAtUtc,

      hasObservedDecisions:
        metrics.total > 0,

      metrics,
    };
  }
}
