import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

import {
  assertValidSchedulerGeneration,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerRestartResult,
} from "./scheduler_recovery_contract.js";

import type {
  DurableSchedulerRecoveryTarget,
} from "./durable_scheduler_recovery_supervisor.js";


export type OffsetSchedulerRecoverySource = {
  readonly generation:
    number;

  readonly state:
    SchedulerRuntimeState;

  restart():
    Promise<SchedulerRestartResult>;
};


function translateGeneration(
  localGeneration:
    number,

  generationOffset:
    number,
): number {
  assertValidSchedulerGeneration(
    localGeneration,
  );

  const translated =
    localGeneration +
    generationOffset;

  assertValidSchedulerGeneration(
    translated,
  );

  return translated;
}


export class OffsetSchedulerRecoveryFacade
implements DurableSchedulerRecoveryTarget<SchedulerRestartResult> {
  private readonly generationOffset:
    number;


  public constructor(
    private readonly recovery:
      OffsetSchedulerRecoverySource,

    durableGeneration:
      number,
  ) {
    assertValidSchedulerGeneration(
      recovery.generation,
    );

    assertValidSchedulerGeneration(
      durableGeneration,
    );

    this.generationOffset =
      durableGeneration -
      recovery.generation;

    if (this.generationOffset < 0) {
      throw new Error(
        "Durable generation must not precede the recovery-local generation.",
      );
    }


    /*
     * Force overflow / validity checking during construction.
     */
    translateGeneration(
      recovery.generation,
      this.generationOffset,
    );
  }


  public get generation():
    number {
    return translateGeneration(
      this.recovery.generation,
      this.generationOffset,
    );
  }


  public get state():
    SchedulerRuntimeState {
    return this.recovery.state;
  }


  public async restart():
    Promise<SchedulerRestartResult> {
    const result =
      await this.recovery.restart();

    const previousGeneration =
      translateGeneration(
        result.previousGeneration,
        this.generationOffset,
      );

    const currentGeneration =
      translateGeneration(
        result.currentGeneration,
        this.generationOffset,
      );

    return {
      ...result,

      previousGeneration,

      currentGeneration,
    };
  }
}
