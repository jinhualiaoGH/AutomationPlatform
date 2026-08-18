import {
  SchedulerControlAdmissionEventHistory,
  type SchedulerControlAdmissionEvent,
} from "./scheduler_control_admission_event_history.js";


export type SchedulerControlAdmissionHistoryStatusClock =
  () => Date;


export type SchedulerControlAdmissionHistoryOperationalStatus = {
  readonly observedAtUtc:
    Date;

  readonly capacity:
    number;

  readonly size:
    number;

  readonly dropped:
    number;

  readonly hasEvents:
    boolean;

  readonly events:
    readonly SchedulerControlAdmissionEvent[];
};


function defaultClock():
  Date {

  return new Date();
}


function cloneDate(
  value:
    Date,

  label:
    string,
): Date {

  const milliseconds =
    value.getTime();


  if (!Number.isFinite(milliseconds)) {

    throw new Error(
      `${label} returned an invalid Date.`,
    );
  }


  return new Date(
    milliseconds,
  );
}


function cloneEvent(
  event:
    SchedulerControlAdmissionEvent,
): SchedulerControlAdmissionEvent {

  return {
    sequence:
      event.sequence,

    observedAtUtc:
      new Date(
        event.observedAtUtc.getTime(),
      ),

    disposition:
      event.disposition,

    command:
      event.command,

    reason:
      event.reason,
  };
}


/**
 * Read-only operational projection over A19 admission history.
 *
 * This service:
 *
 * - owns no scheduler-control behavior
 * - owns no admission policy
 * - records no events
 * - performs no persistence
 * - exposes a defensive chronological snapshot
 */
export class SchedulerControlAdmissionHistoryStatusService {

  public constructor(
    private readonly history:
      SchedulerControlAdmissionEventHistory,

    private readonly clock:
      SchedulerControlAdmissionHistoryStatusClock =
      defaultClock,
  ) {}


  public getStatus():
    SchedulerControlAdmissionHistoryOperationalStatus {

    const observedAtUtc =
      cloneDate(
        this.clock(),
        "Admission history status clock",
      );


    const snapshot =
      this.history.getSnapshot();


    return {
      observedAtUtc,

      capacity:
        snapshot.capacity,

      size:
        snapshot.size,

      dropped:
        snapshot.dropped,

      hasEvents:
        snapshot.size > 0,

      events:
        snapshot.events.map(
          cloneEvent,
        ),
    };
  }
}
