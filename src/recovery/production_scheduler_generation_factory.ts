import {
  assertValidSchedulerGeneration,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerGeneration,
  SchedulerGenerationFactory,
  SchedulerGenerationRuntime,
} from "./scheduler_recovery_contract.js";

import {
  SchedulerPollingLoop,
} from "../scheduling/scheduler_polling_loop.js";

import {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";

export type SchedulerGenerationDispatcher =
  ConstructorParameters<
    typeof SchedulerPollingLoop
  >[0];

export class ProductionSchedulerGenerationFactory
implements SchedulerGenerationFactory {
  public constructor(
    private readonly dispatcher:
      SchedulerGenerationDispatcher,
  ) {}

  public create(
    generation:
      SchedulerGeneration,
  ): SchedulerGenerationRuntime {
    assertValidSchedulerGeneration(
      generation,
    );

    const pollingLoop =
      new SchedulerPollingLoop(
        this.dispatcher,
      );

    return new SchedulerRuntime(
      pollingLoop,
    );
  }
}
