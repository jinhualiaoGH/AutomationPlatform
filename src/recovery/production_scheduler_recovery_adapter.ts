import {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";

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

import type {
  SchedulerGeneration,
} from "./scheduler_recovery_contract.js";

import {
  SchedulerRecoverySupervisor,
} from "./scheduler_recovery_supervisor.js";

import {
  SchedulerControlService,
} from "../operations/scheduler_control_service.js";


export class ObservableProductionSchedulerGenerationFactory
extends ProductionSchedulerGenerationFactory {
  private currentRuntimeValue:
    SchedulerRuntime | null =
    null;

  public override create(
    generation:
      SchedulerGeneration,
  ): SchedulerRuntime {
    const runtime =
      super.create(
        generation,
      );

    if (!(runtime instanceof SchedulerRuntime)) {
      throw new Error(
        "Production scheduler generation factory did not produce SchedulerRuntime.",
      );
    }

    this.currentRuntimeValue =
      runtime;

    return runtime;
  }

  public get currentRuntime():
    SchedulerRuntime {
    if (!this.currentRuntimeValue) {
      throw new Error(
        "Scheduler generation runtime has not been created.",
      );
    }

    return this.currentRuntimeValue;
  }
}


/*
 * Frozen A8 compatibility facade.
 *
 * The Proxy target is the real generation-1 SchedulerRuntime,
 * therefore:
 *
 *   facade instanceof SchedulerRuntime === true
 *
 * All operational reads and methods are resolved dynamically
 * against the currently published generation.
 *
 * start()/stop() are explicitly governed by the supervisor.
 */
export function createSchedulerRuntimeRecoveryFacade(
  supervisor:
    SchedulerRecoverySupervisor,

  generationFactory:
    ObservableProductionSchedulerGenerationFactory,
): SchedulerRuntime {
  const compatibilityTarget =
    generationFactory.currentRuntime;

  return new Proxy(
    compatibilityTarget,

    {
      get(
        _target,
        property,
      ): unknown {
        if (property === "start") {
          return supervisor.start.bind(
            supervisor,
          );
        }

        if (property === "stop") {
          return supervisor.stop.bind(
            supervisor,
          );
        }

        const activeRuntime =
          generationFactory.currentRuntime;

        const value =
          Reflect.get(
            activeRuntime,
            property,
            activeRuntime,
          );

        if (typeof value === "function") {
          return value.bind(
            activeRuntime,
          );
        }

        return value;
      },

      set(
        _target,
        property,
        value,
      ): boolean {
        const activeRuntime =
          generationFactory.currentRuntime;

        return Reflect.set(
          activeRuntime,
          property,
          value,
          activeRuntime,
        );
      },
    },
  );
}


export type ProductionRecoveryControlComposition = {
  readonly generationFactory:
    ObservableProductionSchedulerGenerationFactory;

  readonly supervisor:
    SchedulerRecoverySupervisor;

  readonly scheduler:
    SchedulerRuntime;

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


export function createProductionRecoveryControlComposition(
  dispatcher:
    SchedulerGenerationDispatcher,
): ProductionRecoveryControlComposition {
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

  const frozenControlService =
    new SchedulerControlService(
      scheduler,
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
    scheduler,
    frozenControlService,
    recoveryControlService,
    coordinator,
    auditRepository,
    auditedExecutor,
  };
}
