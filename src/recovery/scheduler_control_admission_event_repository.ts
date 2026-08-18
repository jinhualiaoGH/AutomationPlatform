import type {
  SchedulerControlAdmissionEvent,
} from "./scheduler_control_admission_event_history.js";


export type StoredSchedulerControlAdmissionEvent = {
  readonly sequence:
    number;

  readonly observedAtUtc:
    Date;

  readonly disposition:
    SchedulerControlAdmissionEvent["disposition"];

  readonly command:
    SchedulerControlAdmissionEvent["command"];

  readonly reason:
    SchedulerControlAdmissionEvent["reason"];
};


export interface SchedulerControlAdmissionEventRepository {

  append(
    event:
      StoredSchedulerControlAdmissionEvent,
  ): Promise<void>;


  list():
    Promise<
      readonly StoredSchedulerControlAdmissionEvent[]
    >;
}


function cloneEvent(
  event:
    StoredSchedulerControlAdmissionEvent,
): StoredSchedulerControlAdmissionEvent {

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


function assertValidEvent(
  event:
    StoredSchedulerControlAdmissionEvent,
): void {

  if (
    !Number.isSafeInteger(
      event.sequence,
    ) ||
    event.sequence <= 0
  ) {

    throw new Error(
      "Admission event sequence must be a positive safe integer.",
    );
  }


  if (
    !Number.isFinite(
      event.observedAtUtc.getTime(),
    )
  ) {

    throw new Error(
      "Admission event observation time is invalid.",
    );
  }
}


/**
 * Deterministic in-memory implementation of the A20 durable
 * admission-event repository contract.
 *
 * This implementation is intentionally non-durable and exists to
 * freeze repository semantics before database integration.
 *
 * Invariants:
 *
 * - append-only
 * - insertion order preserved
 * - defensive event copies
 * - duplicate sequence rejected
 * - no mutation of caller-owned event objects
 */
export class InMemorySchedulerControlAdmissionEventRepository
implements SchedulerControlAdmissionEventRepository {

  private readonly events:
    StoredSchedulerControlAdmissionEvent[] =
    [];


  public async append(
    event:
      StoredSchedulerControlAdmissionEvent,
  ): Promise<void> {

    assertValidEvent(
      event,
    );


    if (
      this.events.some(
        (existing) =>
          existing.sequence ===
          event.sequence,
      )
    ) {

      throw new Error(
        `Admission event sequence ${event.sequence} already exists.`,
      );
    }


    this.events.push(
      cloneEvent(
        event,
      ),
    );
  }


  public async list():
    Promise<
      readonly StoredSchedulerControlAdmissionEvent[]
    > {

    return this.events.map(
      cloneEvent,
    );
  }
}
