import {
  SchedulerControlService,
} from "../operations/scheduler_control_service.js";

import {
  SchedulerRecoveryControlAuditRepository,
} from "../repositories/scheduler_recovery_control_audit_repository.js";

import {
  AuditedRecoverySchedulerControlExecutor,
} from "./audited_recovery_scheduler_control_executor.js";

import {
  ProductionSchedulerGenerationFactory,
} from "./production_scheduler_generation_factory.js";

import type {
  SchedulerGenerationDispatcher,
} from "./production_scheduler_generation_factory.js";

import {
  RecoveryAwareSchedulerControlCoordinator,
} from "./recovery_aware_scheduler_control_coordinator.js";

import {
  RecoveryAwareSchedulerControlService,
} from "./recovery_aware_scheduler_control_service.js";

import {
  SchedulerRecoverySupervisor,
} from "./scheduler_recovery_supervisor.js";

export type RecoveryControlComposition = {
  readonly generationFactory:
    ProductionSchedulerGenerationFactory;

  readonly supervisor:
    SchedulerRecoverySupervisor;

  readonly frozenControlService:
    SchedulerControlService;

  readonly recoveryControlService:
    RecoveryAwareSchedulerControlService;

  readonly coordinator:
    RecoveryAwareSchedulerControlCoordinator;

  readonly auditRepository:
    SchedulerRecoveryControlAuditRepository;

  readonly auditedExecutor:
    AuditedRecoverySchedulerControlExecutor;
};

export function createRecoveryControlComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
): RecoveryControlComposition {
  const generationFactory =
    new ProductionSchedulerGenerationFactory(
      dispatcher,
    );

  const supervisor =
    new SchedulerRecoverySupervisor(
      generationFactory,
    );

  const frozenControlService =
    new SchedulerControlService(
      supervisor,
    );

  const recoveryControlService =
    new RecoveryAwareSchedulerControlService(
      frozenControlService,
      supervisor,
    );

  const coordinator =
    new RecoveryAwareSchedulerControlCoordinator(
      recoveryControlService,
    );

  const auditRepository =
    new SchedulerRecoveryControlAuditRepository();

  const auditedExecutor =
    new AuditedRecoverySchedulerControlExecutor(
      coordinator,
      auditRepository,
    );

  return {
    generationFactory,
    supervisor,
    frozenControlService,
    recoveryControlService,
    coordinator,
    auditRepository,
    auditedExecutor,
  };
}
