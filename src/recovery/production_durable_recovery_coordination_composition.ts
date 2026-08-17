import {
  createDurableProductionRecoveryControlComposition,
  type DurableProductionRecoveryControlComposition,
} from "./durable_production_recovery_control_composition.js";

import {
  ProductionDurableRecoveryCoordinationAdapter,
} from "./production_durable_recovery_coordination_adapter.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";


type ProductionDurableRestartResult =
  Awaited<
    ReturnType<
      DurableProductionRecoveryControlComposition[
        "durableSupervisor"
      ]["restart"]
    >
  >;


export type ProductionDurableRecoveryCoordinationComposition = {
  /*
   * Frozen A10 production composition remains available
   * unchanged and retains ownership of start/stop plus all
   * existing control/audit components.
   */
  readonly base:
    DurableProductionRecoveryControlComposition;

  /*
   * A11 restart facade translates only the cross-process
   * stale-CAS case into superseded coordination semantics.
   */
  readonly coordinatedRecovery:
    ProductionDurableRecoveryCoordinationAdapter<
      ProductionDurableRestartResult
    >;
};


export function composeProductionDurableRecoveryCoordination(
  base:
    DurableProductionRecoveryControlComposition,
): ProductionDurableRecoveryCoordinationComposition {

  const coordinatedRecovery =
    new ProductionDurableRecoveryCoordinationAdapter(
      base.durableSupervisor,
      base.generationAllocator,
    );


  return {
    base,
    coordinatedRecovery,
  };
}


export async function createProductionDurableRecoveryCoordinationComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
): Promise<ProductionDurableRecoveryCoordinationComposition> {

  const base =
    await createDurableProductionRecoveryControlComposition(
      dispatcher,
    );


  return composeProductionDurableRecoveryCoordination(
    base,
  );
}
