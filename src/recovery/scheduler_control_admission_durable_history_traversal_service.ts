import type {
  SchedulerControlAdmissionDurableHistoryQuery,
  SchedulerControlAdmissionDurableHistoryService,
  SchedulerControlAdmissionDurableHistorySnapshot,
} from "./scheduler_control_admission_durable_history_service.js";

import type {
  StoredSchedulerControlAdmissionEvent,
} from "./scheduler_control_admission_event_repository.js";


export type SchedulerControlAdmissionDurableHistoryTraversalQuery = {
  readonly limit?:
    number;

  readonly beforeSequence?:
    number;

  readonly command?:
    SchedulerControlAdmissionDurableHistoryQuery["command"];

  readonly observedAtOrAfter?:
    Date;

  readonly observedBefore?:
    Date;
};


export type SchedulerControlAdmissionDurableHistoryTraversalResult = {
  readonly events:
    readonly StoredSchedulerControlAdmissionEvent[];

  readonly pages:
    number;

  readonly returned:
    number;

  readonly exhausted:
    boolean;

  readonly nextBeforeSequence:
    number |
    null;
};


function cloneQuery(
  query:
    SchedulerControlAdmissionDurableHistoryTraversalQuery,
): SchedulerControlAdmissionDurableHistoryTraversalQuery {

  return {
    ...query,

    ...(
      query.observedAtOrAfter ===
        undefined
        ? {}
        : {
            observedAtOrAfter:
              new Date(
                query.observedAtOrAfter.getTime(),
              ),
          }
    ),

    ...(
      query.observedBefore ===
        undefined
        ? {}
        : {
            observedBefore:
              new Date(
                query.observedBefore.getTime(),
              ),
          }
    ),
  };
}


function assertContinuationProgress(
  currentBeforeSequence:
    number |
    undefined,

  nextBeforeSequence:
    number,
): void {

  if (
    !Number.isSafeInteger(
      nextBeforeSequence,
    ) ||
    nextBeforeSequence <= 0
  ) {

    throw new Error(
      "Durable admission history nextBeforeSequence must be a positive safe integer.",
    );
  }


  if (
    currentBeforeSequence !== undefined &&
    nextBeforeSequence >=
      currentBeforeSequence
  ) {

    throw new Error(
      "Durable admission history continuation must make strict backward progress.",
    );
  }
}

export class SchedulerControlAdmissionDurableHistoryTraversalService {

  public constructor(
    private readonly historyService:
      SchedulerControlAdmissionDurableHistoryService,
  ) {}


  public async traverse(
    query:
      SchedulerControlAdmissionDurableHistoryTraversalQuery =
        {},
  ): Promise<SchedulerControlAdmissionDurableHistoryTraversalResult> {

    const baseQuery =
      cloneQuery(
        query,
      );


    let beforeSequence =
      baseQuery.beforeSequence;


    const events:
      StoredSchedulerControlAdmissionEvent[] =
      [];


    let pages =
      0;


    while (true) {

      const pageQuery:
        SchedulerControlAdmissionDurableHistoryQuery = {

          ...baseQuery,

          ...(
            beforeSequence ===
              undefined
              ? {}
              : {
                  beforeSequence,
                }
          ),
      };


      const snapshot:
        SchedulerControlAdmissionDurableHistorySnapshot =
        await this.historyService.getSnapshot(
          pageQuery,
        );


      pages +=
        1;


      events.push(
        ...snapshot.events,
      );


      if (
        snapshot.hasMore !==
          true ||
        snapshot.nextBeforeSequence ===
          undefined ||
        snapshot.nextBeforeSequence ===
          null
      ) {

        return {
          events,

          pages,

          returned:
            events.length,

          exhausted:
            true,

          nextBeforeSequence:
            null,
        };
      }


      assertContinuationProgress(
        beforeSequence,
        snapshot.nextBeforeSequence,
      );


      beforeSequence =
        snapshot.nextBeforeSequence;
    }
  }
}
