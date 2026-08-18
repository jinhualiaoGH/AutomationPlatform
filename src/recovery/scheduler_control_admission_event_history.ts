import type {
  SchedulerControlAdmissionObservation,
} from "./scheduler_control_admission_metrics.js";


export type SchedulerControlAdmissionEvent = {
  readonly sequence:
    number;

  readonly observedAtUtc:
    Date;

  readonly disposition:
    SchedulerControlAdmissionObservation["disposition"];

  readonly command:
    SchedulerControlAdmissionObservation["command"];

  readonly reason:
    SchedulerControlAdmissionObservation["reason"];
};


export type SchedulerControlAdmissionEventHistorySnapshot = {
  readonly capacity:
    number;

  readonly size:
    number;

  readonly dropped:
    number;

  readonly events:
    readonly SchedulerControlAdmissionEvent[];
};


function assertPositiveSafeInteger(
  value:
    number,

  label:
    string,
): void {

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {

    throw new Error(
      `${label} must be a positive safe integer.`,
    );
  }
}


function assertValidDate(
  value:
    Date,
): number {

  const milliseconds =
    value.getTime();


  if (!Number.isFinite(milliseconds)) {

    throw new Error(
      "Admission event observation time is invalid.",
    );
  }


  return milliseconds;
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
 * Bounded in-memory history of scheduler-control admission decisions.
 *
 * A19.1 owns history only:
 *
 * - no admission policy
 * - no scheduler mutation
 * - no HTTP behavior
 * - no durable persistence
 * - no production wiring
 *
 * Events are appended in observation order. When capacity is reached,
 * the oldest event is discarded and the dropped counter advances.
 */
export class SchedulerControlAdmissionEventHistory {

  private readonly events:
    SchedulerControlAdmissionEvent[] =
    [];


  private nextSequence =
    1;


  private dropped =
    0;


  public constructor(
    private readonly capacity:
      number,
  ) {

    assertPositiveSafeInteger(
      capacity,
      "Admission event history capacity",
    );
  }


  public record(
    observation:
      SchedulerControlAdmissionObservation,

    observedAtUtc:
      Date,
  ): SchedulerControlAdmissionEvent {

    const observedMilliseconds =
      assertValidDate(
        observedAtUtc,
      );


    if (
      this.nextSequence >
      Number.MAX_SAFE_INTEGER
    ) {

      throw new Error(
        "Admission event sequence overflow.",
      );
    }


    const event:
      SchedulerControlAdmissionEvent = {

      sequence:
        this.nextSequence,

      observedAtUtc:
        new Date(
          observedMilliseconds,
        ),

      disposition:
        observation.disposition,

      command:
        observation.command,

      reason:
        observation.reason,
    };


    this.nextSequence +=
      1;


    if (
      this.events.length ===
      this.capacity
    ) {

      this.events.shift();


      if (
        this.dropped ===
        Number.MAX_SAFE_INTEGER
      ) {

        throw new Error(
          "Admission event dropped counter overflow.",
        );
      }


      this.dropped +=
        1;
    }


    this.events.push(
      event,
    );


    return cloneEvent(
      event,
    );
  }


  public getSnapshot():
    SchedulerControlAdmissionEventHistorySnapshot {

    return {
      capacity:
        this.capacity,

      size:
        this.events.length,

      dropped:
        this.dropped,

      events:
        this.events.map(
          cloneEvent,
        ),
    };
  }
}
