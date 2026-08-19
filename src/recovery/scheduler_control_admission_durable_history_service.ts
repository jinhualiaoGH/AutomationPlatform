import type {
  SchedulerControlAdmissionCommand,
} from "./scheduler_control_admission.js";

import type {
  BoundedSchedulerControlAdmissionEventRepository,
  SchedulerControlAdmissionEventRepository,
  StoredSchedulerControlAdmissionEvent,
} from "./scheduler_control_admission_event_repository.js";


export type SchedulerControlAdmissionDurableHistoryQuery = {
  readonly limit?:
    number;

  readonly beforeSequence?:
    number;

  readonly command?:
    SchedulerControlAdmissionCommand;
};

export type SchedulerControlAdmissionDurableHistorySnapshot = {
  readonly total:
    number;

  readonly returned:
    number;

  readonly limit:
    number;

  readonly events:
    readonly StoredSchedulerControlAdmissionEvent[];

  readonly hasMore?:
    boolean;

  readonly nextBeforeSequence?:
    number | null;

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
function isBoundedRepository(
  repository:
    SchedulerControlAdmissionEventRepository,
): repository is
  BoundedSchedulerControlAdmissionEventRepository {

  const candidate =
    repository as
      SchedulerControlAdmissionEventRepository & {
        readonly listPage?:
          unknown;
      };


  return typeof candidate.listPage ===
    "function";
}

function assertValidBeforeSequence(
  beforeSequence:
    number,
): void {

  if (
    !Number.isSafeInteger(
      beforeSequence,
    ) ||
    beforeSequence <= 0
  ) {

    throw new Error(
      "Durable admission history beforeSequence must be a positive safe integer.",
    );
  }
}

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
    input:
      number |
      SchedulerControlAdmissionDurableHistoryQuery =
        this.defaultLimit,
  ): Promise<SchedulerControlAdmissionDurableHistorySnapshot> {


    const cursorAware =
      typeof input !==
        "number";


    const query:
      SchedulerControlAdmissionDurableHistoryQuery =
        typeof input ===
          "number"
          ? {
              limit:
                input,
            }
          : input;


    const limit =
      query.limit ??
      this.defaultLimit;


    const beforeSequence =
      query.beforeSequence;


    const command =
      query.command;


    assertValidLimit(
      limit,
    );


    if (
      beforeSequence !==
        undefined
    ) {

      assertValidBeforeSequence(
        beforeSequence,
      );
    }


    if (
      isBoundedRepository(
        this.repository,
      )
    ) {

      const page =
        await this.repository.listPage({
          limit,

          ...(
            beforeSequence ===
              undefined
              ? {}
              : {
                  beforeSequence,
                }
          ),

          ...(
            command ===
              undefined
              ? {}
              : {
                  command,
                }
          ),
        });


      const events =
        page.events.map(
          cloneEvent,
        );


      return {
        total:
          page.total,

        returned:
          events.length,

        limit,

        events,

        ...(
          cursorAware
            ? {
                hasMore:
                  page.hasMore,

                nextBeforeSequence:
                  page.nextBeforeSequence,
              }
            : {}
        ),
      };
    }


    const stored =
      await this.repository.list();


    const commandEligible =
      command ===
        undefined
        ? stored
        : stored.filter(
            (event) =>
              event.command ===
              command,
          );


    const eligible =
      beforeSequence ===
        undefined
        ? commandEligible
        : commandEligible.filter(
            (event) =>
              event.sequence <
              beforeSequence,
          );


    const total =
      eligible.length;


    const start =
      Math.max(
        0,
        total - limit,
      );


    const events =
      eligible
        .slice(
          start,
        )
        .map(
          cloneEvent,
        );


    const hasMore =
      total >
      limit;


    const nextBeforeSequence =
      hasMore &&
      events.length > 0
        ? events[0]!.sequence
        : null;


    return {
      total,

      returned:
        events.length,

      limit,

      events,

      ...(
        cursorAware
          ? {
              hasMore,

              nextBeforeSequence,
            }
          : {}
      ),
    };
  }
}
