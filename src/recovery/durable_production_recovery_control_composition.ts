import {
  SchedulerControlService,
} from "../operations/scheduler_control_service.js";

import {
  SchedulerGenerationStateRepository,
} from "../repositories/scheduler_generation_state_repository.js";

import {
  SchedulerRecoveryControlAuditRepository,
} from "../repositories/scheduler_recovery_control_audit_repository.js";

import {
  AuditedRecoverySchedulerControlExecutor,
} from "./audited_recovery_scheduler_control_executor.js";

import {
  DurableSchedulerRecoverySupervisor,
} from "./durable_scheduler_recovery_supervisor.js";

import {
  OffsetSchedulerRecoveryFacade,
} from "./offset_scheduler_recovery_facade.js";

import {
  PersistentSchedulerGenerationAllocator,
} from "./persistent_scheduler_generation_allocator.js";

import {
  createSchedulerRuntimeRecoveryFacade,
  ObservableProductionSchedulerGenerationFactory,
} from "./production_scheduler_recovery_adapter.js";

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

import type {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";


export type DurableProductionRecoveryControlComposition = {
  readonly generationFactory:
    ObservableProductionSchedulerGenerationFactory;

  readonly supervisor:
    SchedulerRecoverySupervisor;

  readonly scheduler:
    SchedulerRuntime;

  readonly generationRepository:
    SchedulerGenerationStateRepository;

  readonly generationAllocator:
    PersistentSchedulerGenerationAllocator;

  readonly offsetRecovery:
    OffsetSchedulerRecoveryFacade;

  readonly durableSupervisor:
    DurableSchedulerRecoverySupervisor<
      Awaited<
        ReturnType<
          SchedulerRecoverySupervisor["restart"]
        >
      >
    >;

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


export async function createDurableProductionRecoveryControlComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
):
  Promise<DurableProductionRecoveryControlComposition> {

  /*
   * Frozen A9 runtime/recovery topology is constructed
   * exactly as before.
   */
  const generationFactory =
    new ObservableProductionSchedulerGenerationFactory(
      dispatcher,
    );

  const supervisor =
    new SchedulerRecoverySupervisor(
      generationFactory,
    );

  const scheduler =
    createSchedulerRuntimeRecoveryFacade(
      supervisor,
      generationFactory,
    );


  /*
   * Start/stop remain governed by the frozen lifecycle path.
   */
  const frozenControlService =
    new SchedulerControlService(
      scheduler,
    );


  /*
   * A10 durable identity is observed before the restart
   * translation boundary is published.
   */
  const generationRepository =
    new SchedulerGenerationStateRepository();

  const generationAllocator =
    new PersistentSchedulerGenerationAllocator(
      generationRepository,
    );

  const durableCursor =
    await generationAllocator.load();


  /*
   * Fresh A9 processes may begin locally at generation one.
   *
   * The facade maps that local coordinate system onto the
   * persisted durable generation sequence.
   */
  const offsetRecovery =
    new OffsetSchedulerRecoveryFacade(
      supervisor,
      durableCursor.generation,
    );


  /*
   * Durable restart coordination owns allocation-before-restart
   * and verifies the translated restart provenance.
   */
  const durableSupervisor =
    new DurableSchedulerRecoverySupervisor(
      offsetRecovery,
      generationAllocator,
    );

  await durableSupervisor.initialize();


  /*
   * Recovery-aware service retains the frozen start/stop path,
   * but restart now flows exclusively through durable A10.
   */
  const recoveryControlService =
    new RecoveryAwareSchedulerControlService(
      frozenControlService,
      durableSupervisor,
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
    scheduler,
    generationRepository,
    generationAllocator,
    offsetRecovery,
    durableSupervisor,
    frozenControlService,
    recoveryControlService,
    coordinator,
    auditRepository,
    auditedExecutor,
  };
}
