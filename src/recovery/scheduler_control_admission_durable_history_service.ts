import type {
  SchedulerControlAdmissionEventRepository,
  StoredSchedulerControlAdmissionEvent,
} from "./scheduler_control_admission_event_repository.js";


export type SchedulerControlAdmissionDurableHistorySnapshot = {
  readonly total:
    number;

  readonly returned:
    number;

  readonly limit:
    number;

  readonly events:
    readonly StoredSchedulerControlAdmissionEvent[];
};


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


function assertValidLimit(
  limit:
    number,
): void {

  if (
    !Number.isSafeInteger(
      limit,
    ) ||
    limit <= 0
  ) {

    throw new Error(
      "Durable admission history limit must be a positive safe integer.",
    );
  }
}


/**
 * Restart-safe read model over the A20 durable admission-event repository.
 *
 * This service deliberately does not reconstruct or mutate the frozen
 * A19 process-local history.
 *
 * Repository ordering is preserved, while callers can request only the
 * newest bounded portion of the durable history.
 */
export class SchedulerControlAdmissionDurableHistoryService {

  public constructor(
    private readonly repository:
      SchedulerControlAdmissionEventRepository,

    private readonly defaultLimit:
      number =
      256,
  ) {

    assertValidLimit(
      defaultLimit,
    );
  }


  public async getSnapshot(
    limit:
      number =
      this.defaultLimit,
  ): Promise<SchedulerControlAdmissionDurableHistorySnapshot> {

    assertValidLimit(
      limit,
    );


    const stored =
      await this.repository.list();


    const total =
      stored.length;

    const start =
      Math.max(
        0,
        total - limit,
      );


    const events =
      stored
        .slice(
          start,
        )
        .map(
          cloneEvent,
        );


    return {
      total,

      returned:
        events.length,

      limit,

      events,
    };
  }
}
