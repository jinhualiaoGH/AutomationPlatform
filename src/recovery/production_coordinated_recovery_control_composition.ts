import {
  CoordinatedRecoveryAwareSchedulerControlCoordinator,
} from "./coordinated_recovery_aware_scheduler_control_coordinator.js";

import {
  composeProductionCoordinatedRecoveryControlService,
  createProductionCoordinatedRecoveryControlServiceComposition,
  type ProductionCoordinatedRecoveryControlServiceComposition,
} from "./production_coordinated_recovery_control_service_composition.js";

import type {
  ProductionDurableRecoveryCoordinationComposition,
} from "./production_durable_recovery_coordination_composition.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";


export type ProductionCoordinatedRecoveryControlComposition = {
  readonly base:
    ProductionCoordinatedRecoveryControlServiceComposition;

  readonly coordinator:
    CoordinatedRecoveryAwareSchedulerControlCoordinator;
};


export function composeProductionCoordinatedRecoveryControl(
  base:
    ProductionCoordinatedRecoveryControlServiceComposition,
): ProductionCoordinatedRecoveryControlComposition {

  const coordinator =
    new CoordinatedRecoveryAwareSchedulerControlCoordinator(
      base.controlService,
    );


  return {
    base,
    coordinator,
  };
}


/*
 * Testable boundary for an already accepted A11.5 graph.
 */
export function composeProductionCoordinatedRecoveryControlFromA115(
  base:
    ProductionDurableRecoveryCoordinationComposition,
): ProductionCoordinatedRecoveryControlComposition {

  return composeProductionCoordinatedRecoveryControl(
    composeProductionCoordinatedRecoveryControlService(
      base,
    ),
  );
}


/*
 * Full production construction boundary.
 *
 * No command is executed during composition.
 */
export async function createProductionCoordinatedRecoveryControlComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
):
  Promise<ProductionCoordinatedRecoveryControlComposition> {

  const base =
    await createProductionCoordinatedRecoveryControlServiceComposition(
      dispatcher,
    );


  return composeProductionCoordinatedRecoveryControl(
    base,
  );
}
