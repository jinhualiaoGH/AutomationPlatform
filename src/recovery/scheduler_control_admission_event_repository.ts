import type {
  SchedulerControlAdmissionCommand,
} from "./scheduler_control_admission.js";

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


export type SchedulerControlAdmissionEventPageQuery = {
  readonly limit:
    number;

  readonly beforeSequence?:
    number;

  readonly command?:
    SchedulerControlAdmissionCommand;
};


export type SchedulerControlAdmissionEventPage = {
  readonly total:
    number;

  readonly events:
    readonly StoredSchedulerControlAdmissionEvent[];

  readonly hasMore:
    boolean;

  readonly nextBeforeSequence:
    number |
    null;
};


/**
 * Additive A22 bounded-read contract.
 *
 * Existing A20/A21 consumers may continue using list().
 * Implementations supporting efficient durable history traversal
 * additionally implement listPage().
 *
 * beforeSequence is exclusive.
 * Returned events remain in ascending sequence order.
 */
export interface BoundedSchedulerControlAdmissionEventRepository
extends SchedulerControlAdmissionEventRepository {

  listPage(
    query:
      SchedulerControlAdmissionEventPageQuery,
  ): Promise<SchedulerControlAdmissionEventPage>;
}


function assertValidPageQuery(
  query:
    SchedulerControlAdmissionEventPageQuery,
): void {

  if (
    !Number.isSafeInteger(
      query.limit,
    ) ||
    query.limit <= 0
  ) {

    throw new Error(
      "Admission event page limit must be a positive safe integer.",
    );
  }


  if (
    query.beforeSequence !== undefined &&
    (
      !Number.isSafeInteger(
        query.beforeSequence,
      ) ||
      query.beforeSequence <= 0
    )
  ) {

    throw new Error(
      "Admission event page beforeSequence must be a positive safe integer.",
    );
  }
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
implements BoundedSchedulerControlAdmissionEventRepository {

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


  public async listPage(
    query:
      SchedulerControlAdmissionEventPageQuery,
  ): Promise<SchedulerControlAdmissionEventPage> {

    assertValidPageQuery(
      query,
    );


    const commandEligible =
      query.command === undefined
        ? this.events
        : this.events.filter(
            (event) =>
              event.command ===
              query.command,
          );

    const eligible =
      query.beforeSequence === undefined
        ? commandEligible
        : commandEligible.filter(
            (event) =>
              event.sequence <
              query.beforeSequence!,
          );


    const start =
      Math.max(
        0,
        eligible.length - query.limit,
      );


    const selected =
      eligible.slice(
        start,
      );


    const hasMore =
      start > 0;


    return {
      total:
        eligible.length,

      events:
        selected.map(
          cloneEvent,
        ),

      hasMore,

      nextBeforeSequence:
        hasMore &&
        selected.length > 0
          ? selected[0]!.sequence
          : null,
    };
  }
}
