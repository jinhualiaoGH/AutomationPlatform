export type SchedulerGeneration =
  number;


export type SchedulerGenerationState = {
  readonly currentGeneration:
    SchedulerGeneration;

  readonly rowVersion:
    Readonly<Uint8Array>;
};


export type SchedulerGenerationAllocation = {
  readonly previousGeneration:
    SchedulerGeneration;

  readonly currentGeneration:
    SchedulerGeneration;

  readonly rowVersion:
    Readonly<Uint8Array>;
};


export type SchedulerGenerationAllocationResult =
  | {
      readonly disposition:
        "allocated";

      readonly allocation:
        SchedulerGenerationAllocation;
    }
  | {
      readonly disposition:
        "stale";

      readonly allocation:
        null;
    };


export type SchedulerGenerationStateReader = {
  read():
    Promise<SchedulerGenerationState>;
};


export type SchedulerGenerationAllocator = {
  allocateNext(
    expectedGeneration:
      SchedulerGeneration,

    expectedRowVersion:
      Readonly<Uint8Array>,
  ):
    Promise<SchedulerGenerationAllocationResult>;
};


export type SchedulerGenerationStateStore =
  SchedulerGenerationStateReader &
  SchedulerGenerationAllocator;


export const INITIAL_SCHEDULER_GENERATION:
  SchedulerGeneration =
  1;


export function assertSchedulerGeneration(
  value:
    unknown,
): asserts value is SchedulerGeneration {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < INITIAL_SCHEDULER_GENERATION
  ) {
    throw new Error(
      "Scheduler generation must be a safe integer greater than or equal to 1.",
    );
  }
}


export function nextSchedulerGeneration(
  currentGeneration:
    SchedulerGeneration,
): SchedulerGeneration {
  assertSchedulerGeneration(
    currentGeneration,
  );

  if (
    currentGeneration ===
    Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "Scheduler generation cannot advance beyond Number.MAX_SAFE_INTEGER.",
    );
  }

  return (
    currentGeneration +
    1
  );
}


export function validateGenerationTransition(
  previousGeneration:
    SchedulerGeneration,

  currentGeneration:
    SchedulerGeneration,
): void {
  assertSchedulerGeneration(
    previousGeneration,
  );

  assertSchedulerGeneration(
    currentGeneration,
  );

  if (
    currentGeneration !==
    previousGeneration + 1
  ) {
    throw new Error(
      "Scheduler generation transition must advance exactly once.",
    );
  }
}


export function cloneGenerationRowVersion(
  rowVersion:
    Readonly<Uint8Array>,
): Uint8Array {
  if (rowVersion.length === 0) {
    throw new Error(
      "Scheduler generation rowVersion must not be empty.",
    );
  }

  return Uint8Array.from(
    rowVersion,
  );
}


export function createInitialSchedulerGenerationState(
  rowVersion:
    Readonly<Uint8Array>,
): SchedulerGenerationState {
  return {
    currentGeneration:
      INITIAL_SCHEDULER_GENERATION,

    rowVersion:
      cloneGenerationRowVersion(
        rowVersion,
      ),
  };
}


export function createSchedulerGenerationAllocation(
  previousGeneration:
    SchedulerGeneration,

  currentGeneration:
    SchedulerGeneration,

  rowVersion:
    Readonly<Uint8Array>,
): SchedulerGenerationAllocation {
  validateGenerationTransition(
    previousGeneration,
    currentGeneration,
  );

  return {
    previousGeneration,
    currentGeneration,

    rowVersion:
      cloneGenerationRowVersion(
        rowVersion,
      ),
  };
}
