import {
  createProductionAuditedCoordinatedRecoveryControlComposition,
  type ProductionAuditedCoordinatedRecoveryControlComposition,
} from "./production_audited_coordinated_recovery_control_composition.js";

import {
  createCoordinatedSchedulerRecoveryControlRoutes,
} from "../routes/coordinated_scheduler_recovery_control.js";

import {
  createSchedulerRecoveryCoordinationAuditRoutes,
} from "../routes/scheduler_recovery_coordination_audit.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";


export type ProductionCoordinatedRecoveryHttpComposition = {
  readonly base:
    ProductionAuditedCoordinatedRecoveryControlComposition;

  readonly commandRoutes:
    ReturnType<
      typeof createCoordinatedSchedulerRecoveryControlRoutes
    >;

  readonly coordinationAuditRoutes:
    ReturnType<
      typeof createSchedulerRecoveryCoordinationAuditRoutes
    >;
};


export function composeProductionCoordinatedRecoveryHttp(
  base:
    ProductionAuditedCoordinatedRecoveryControlComposition,
): ProductionCoordinatedRecoveryHttpComposition {

  return {
    base,

    commandRoutes:
      createCoordinatedSchedulerRecoveryControlRoutes(
        base.auditedExecutor,
      ),

    coordinationAuditRoutes:
      createSchedulerRecoveryCoordinationAuditRoutes(
        base.auditRepository,
      ),
  };
}


/*
 * Full asynchronous production construction boundary.
 *
 * No HTTP server is started and no command is executed here.
 */
export async function createProductionCoordinatedRecoveryHttpComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
):
  Promise<
    ProductionCoordinatedRecoveryHttpComposition
  > {

  const base =
    await createProductionAuditedCoordinatedRecoveryControlComposition(
      dispatcher,
    );


  return composeProductionCoordinatedRecoveryHttp(
    base,
  );
}
