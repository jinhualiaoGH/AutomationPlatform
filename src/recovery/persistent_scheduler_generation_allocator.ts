import {
  assertSchedulerGeneration,
  cloneGenerationRowVersion,
  type SchedulerGeneration,
  type SchedulerGenerationAllocation,
  type SchedulerGenerationState,
  type SchedulerGenerationStateStore,
} from "./scheduler_generation_state_contract.js";


export type PersistentSchedulerGenerationCursor = {
  readonly generation:
    SchedulerGeneration;

  readonly rowVersion:
    Readonly<Uint8Array>;
};


export type PersistentSchedulerGenerationAllocation =
  | {
      readonly disposition:
        "allocated";

      readonly previous:
        PersistentSchedulerGenerationCursor;

      readonly current:
        PersistentSchedulerGenerationCursor;
    }
  | {
      readonly disposition:
        "stale";

      readonly previous:
        PersistentSchedulerGenerationCursor;

      readonly current:
        null;
    };


function cursorFromState(
  state:
    SchedulerGenerationState,
): PersistentSchedulerGenerationCursor {
  assertSchedulerGeneration(
    state.currentGeneration,
  );

  return {
    generation:
      state.currentGeneration,

    rowVersion:
      cloneGenerationRowVersion(
        state.rowVersion,
      ),
  };
}


function cursorsFromAllocation(
  allocation:
    SchedulerGenerationAllocation,
): {
  readonly previous:
    PersistentSchedulerGenerationCursor;

  readonly current:
    PersistentSchedulerGenerationCursor;
} {
  assertSchedulerGeneration(
    allocation.previousGeneration,
  );

  assertSchedulerGeneration(
    allocation.currentGeneration,
  );

  if (
    allocation.currentGeneration !==
    allocation.previousGeneration + 1
  ) {
    throw new Error(
      "Persistent scheduler generation allocation must advance exactly once.",
    );
  }

  return {
    previous: {
      generation:
        allocation.previousGeneration,

      rowVersion:
        new Uint8Array(
          allocation.rowVersion.length,
        ),
    },

    current: {
      generation:
        allocation.currentGeneration,

      rowVersion:
        cloneGenerationRowVersion(
          allocation.rowVersion,
        ),
    },
  };
}


function cloneCursor(
  cursor:
    PersistentSchedulerGenerationCursor,
): PersistentSchedulerGenerationCursor {
  assertSchedulerGeneration(
    cursor.generation,
  );

  return {
    generation:
      cursor.generation,

    rowVersion:
      cloneGenerationRowVersion(
        cursor.rowVersion,
      ),
  };
}


export class PersistentSchedulerGenerationAllocator {
  public constructor(
    private readonly store:
      SchedulerGenerationStateStore,
  ) {}


  public async load():
    Promise<PersistentSchedulerGenerationCursor> {
    const state =
      await this.store.read();

    return cursorFromState(
      state,
    );
  }


  public async allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation> {

    const expectedCursor =
      cloneCursor(
        expected,
      );

    const result =
      await this.store.allocateNext(
        expectedCursor.generation,
        expectedCursor.rowVersion,
      );

    if (
      result.disposition ===
      "stale"
    ) {
      return {
        disposition:
          "stale",

        previous:
          expectedCursor,

        current:
          null,
      };
    }

    const cursors =
      cursorsFromAllocation(
        result.allocation,
      );

    if (
      cursors.previous.generation !==
      expectedCursor.generation
    ) {
      throw new Error(
        "Persistent scheduler generation allocation does not match the expected generation.",
      );
    }

    return {
      disposition:
        "allocated",

      previous:
        {
          generation:
            expectedCursor.generation,

          rowVersion:
            cloneGenerationRowVersion(
              expectedCursor.rowVersion,
            ),
        },

      current:
        cursors.current,
    };
  }
}
