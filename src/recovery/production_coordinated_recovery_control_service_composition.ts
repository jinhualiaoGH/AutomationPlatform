import {
  CoordinatedRecoveryAwareSchedulerControlService,
} from "./coordinated_recovery_aware_scheduler_control_service.js";

import {
  composeProductionDurableRecoveryCoordination,
  createProductionDurableRecoveryCoordinationComposition,
  type ProductionDurableRecoveryCoordinationComposition,
} from "./production_durable_recovery_coordination_composition.js";

import type {
  DurableProductionRecoveryControlComposition,
} from "./durable_production_recovery_control_composition.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";


export type ProductionCoordinatedRecoveryControlServiceComposition = {
  /*
   * Accepted A11.5 composition remains available by identity.
   */
  readonly base:
    ProductionDurableRecoveryCoordinationComposition;

  /*
   * A11.6 widens only the control-service restart result.
   *
   * No coordinator, audit executor, HTTP route, or server
   * ownership is changed in this phase.
   */
  readonly controlService:
    CoordinatedRecoveryAwareSchedulerControlService;
};


export function composeProductionCoordinatedRecoveryControlService(
  base:
    ProductionDurableRecoveryCoordinationComposition,
): ProductionCoordinatedRecoveryControlServiceComposition {

  const controlService =
    new CoordinatedRecoveryAwareSchedulerControlService(
      base.base.frozenControlService,
      base.coordinatedRecovery,
    );


  return {
    base,
    controlService,
  };
}


/*
 * Testable composition boundary for an already-created
 * frozen A10 production graph.
 */
export function composeProductionCoordinatedRecoveryControlServiceFromA10(
  base:
    DurableProductionRecoveryControlComposition,
): ProductionCoordinatedRecoveryControlServiceComposition {

  return composeProductionCoordinatedRecoveryControlService(
    composeProductionDurableRecoveryCoordination(
      base,
    ),
  );
}


/*
 * Full production factory.
 *
 * Construction only.  No command is executed here.
 */
export async function createProductionCoordinatedRecoveryControlServiceComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
):
  Promise<ProductionCoordinatedRecoveryControlServiceComposition> {

  const base =
    await createProductionDurableRecoveryCoordinationComposition(
      dispatcher,
    );


  return composeProductionCoordinatedRecoveryControlService(
    base,
  );
}
