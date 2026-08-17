import {
  SchedulerRecoveryCoordinationAuditRepository,
} from "../repositories/scheduler_recovery_coordination_audit_repository.js";

import {
  AuditedCoordinatedRecoverySchedulerControlExecutor,
} from "./audited_coordinated_recovery_scheduler_control_executor.js";

import {
  createProductionCoordinatedRecoveryControlComposition,
  type ProductionCoordinatedRecoveryControlComposition,
} from "./production_coordinated_recovery_control_composition.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";


export type ProductionAuditedCoordinatedRecoveryControlComposition = {
  readonly base:
    ProductionCoordinatedRecoveryControlComposition;

  readonly auditRepository:
    SchedulerRecoveryCoordinationAuditRepository;

  readonly auditedExecutor:
    AuditedCoordinatedRecoverySchedulerControlExecutor;
};


export function composeProductionAuditedCoordinatedRecoveryControl(
  base:
    ProductionCoordinatedRecoveryControlComposition,
):
  ProductionAuditedCoordinatedRecoveryControlComposition {

  const auditRepository =
    new SchedulerRecoveryCoordinationAuditRepository();


  const auditedExecutor =
    new AuditedCoordinatedRecoverySchedulerControlExecutor(
      base.coordinator,
      auditRepository,
    );


  return {
    base,
    auditRepository,
    auditedExecutor,
  };
}


export async function createProductionAuditedCoordinatedRecoveryControlComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
):
  Promise<
    ProductionAuditedCoordinatedRecoveryControlComposition
  > {

  const base =
    await createProductionCoordinatedRecoveryControlComposition(
      dispatcher,
    );


  return composeProductionAuditedCoordinatedRecoveryControl(
    base,
  );
}
