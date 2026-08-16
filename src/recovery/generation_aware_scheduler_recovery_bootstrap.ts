import type {
  PersistentSchedulerGenerationCursor,
} from "./persistent_scheduler_generation_allocator.js";


export type SchedulerGenerationCursorLoader = {
  load():
    Promise<PersistentSchedulerGenerationCursor>;
};


export type SchedulerGenerationFactory<
  TGeneration,
> = {
  create(
    generation:
      number,
  ):
    TGeneration;
};


export type SchedulerRecoveryConstructor<
  TGeneration,
  TRecovery,
> = (
  initialGeneration:
    TGeneration,
) => TRecovery;


export type GenerationAwareSchedulerRecoveryBootstrapResult<
  TGeneration,
  TRecovery,
> = {
  readonly cursor:
    PersistentSchedulerGenerationCursor;

  readonly initialGeneration:
    TGeneration;

  readonly recovery:
    TRecovery;
};


function cloneCursor(
  cursor:
    PersistentSchedulerGenerationCursor,
): PersistentSchedulerGenerationCursor {
  if (
    !Number.isSafeInteger(
      cursor.generation,
    ) ||
    cursor.generation < 1
  ) {
    throw new Error(
      "Durable scheduler generation must be a positive safe integer.",
    );
  }

  return {
    generation:
      cursor.generation,

    rowVersion:
      Uint8Array.from(
        cursor.rowVersion,
      ),
  };
}


export class GenerationAwareSchedulerRecoveryBootstrap<
  TGeneration,
  TRecovery,
> {
  public constructor(
    private readonly cursorLoader:
      SchedulerGenerationCursorLoader,

    private readonly generationFactory:
      SchedulerGenerationFactory<TGeneration>,

    private readonly createRecovery:
      SchedulerRecoveryConstructor<
        TGeneration,
        TRecovery
      >,
  ) {}


  public async create():
    Promise<
      GenerationAwareSchedulerRecoveryBootstrapResult<
        TGeneration,
        TRecovery
      >
    > {
    /*
     * Durable identity MUST be observed before any
     * generation-local runtime object is constructed.
     */
    const loadedCursor =
      await this.cursorLoader.load();

    const cursor =
      cloneCursor(
        loadedCursor,
      );

    /*
     * The persisted durable generation is the sole
     * source of the initial generation identity.
     */
    const initialGeneration =
      this.generationFactory.create(
        cursor.generation,
      );

    /*
     * Recovery construction occurs only after the
     * correct generation-local runtime exists.
     *
     * The callback keeps this A10 layer independent
     * from the frozen A9 supervisor constructor ABI.
     */
    const recovery =
      this.createRecovery(
        initialGeneration,
      );

    return {
      cursor:
        cloneCursor(
          cursor,
        ),

      initialGeneration,

      recovery,
    };
  }
}
