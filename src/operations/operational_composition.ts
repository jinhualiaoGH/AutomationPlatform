import {
  AuditedSchedulerControlExecutor,
} from "./audited_scheduler_control_executor.js";

import {
  ExecutionHistoryService,
} from "./execution_history_service.js";

import {
  SchedulerControlAuditService,
} from "./scheduler_control_audit_service.js";

import {
  SchedulerControlCoordinator,
} from "./scheduler_control_coordinator.js";

import {
  SchedulerControlService,
} from "./scheduler_control_service.js";

import {
  MetricsObservingSchedulerDispatcher,
  SchedulerMetricsAccumulator,
} from "./scheduler_metrics.js";

import {
  SchedulerStatusService,
} from "./scheduler_status_service.js";

import {
  AutomationExecutionHistoryRepository,
} from "../repositories/automation_execution_history_repository.js";

import {
  SchedulerControlAuditRepository,
} from "../repositories/scheduler_control_audit_repository.js";

import {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";

import {
  TriggerDispatcher,
} from "../scheduling/trigger_dispatcher.js";

import {
  createProductionRecoveryControlComposition,
} from "../recovery/production_scheduler_recovery_adapter.js";

import type {
  ProductionRecoveryControlComposition,
} from "../recovery/production_scheduler_recovery_adapter.js";

import {
  createDurableProductionRecoveryControlComposition,
} from "../recovery/durable_production_recovery_control_composition.js";

import type {
  DurableProductionRecoveryControlComposition,
} from "../recovery/durable_production_recovery_control_composition.js";


export type OperationalComposition = {
  /*
   * Frozen A8 ABI:
   * remains a SchedulerRuntime-compatible object.
   */
  scheduler:
    SchedulerRuntime;

  recovery:
    ProductionRecoveryControlComposition;

  metrics:
    SchedulerMetricsAccumulator;

  statusService:
    SchedulerStatusService;

  historyService:
    ExecutionHistoryService;

  controlService:
    SchedulerControlService;

  controlCoordinator:
    SchedulerControlCoordinator;

  controlAuditRepository:
    SchedulerControlAuditRepository;

  controlAuditService:
    SchedulerControlAuditService;

  auditedControlExecutor:
    AuditedSchedulerControlExecutor;
};


export function createOperationalComposition():
  OperationalComposition {
  const metrics =
    new SchedulerMetricsAccumulator();

  const dispatcher =
    new TriggerDispatcher();

  const observingDispatcher =
    new MetricsObservingSchedulerDispatcher(
      dispatcher,
      metrics,
    );

  const recovery =
    createProductionRecoveryControlComposition(
      observingDispatcher,
    );

  /*
   * Stable SchedulerRuntime-compatible facade.
   * Its target is generation 1, while operations and
   * observations dynamically follow the active generation.
   */
  const scheduler =
    recovery.scheduler;

  const statusService =
    new SchedulerStatusService(
      scheduler,
      metrics,
    );

  const historyRepository =
    new AutomationExecutionHistoryRepository();

  const historyService =
    new ExecutionHistoryService(
      historyRepository,
    );

  /*
   * Frozen A8 HTTP start/stop semantics remain unchanged.
   * Public restart exposure remains deferred.
   */
  const controlService =
    new SchedulerControlService(
      scheduler,
    );

  const controlCoordinator =
    new SchedulerControlCoordinator(
      controlService,
    );

  const controlAuditRepository =
    new SchedulerControlAuditRepository();

  const controlAuditService =
    new SchedulerControlAuditService(
      controlAuditRepository,
    );

  const auditedControlExecutor =
    new AuditedSchedulerControlExecutor(
      controlCoordinator,
      controlAuditRepository,
    );

  return {
    scheduler,
    recovery,
    metrics,
    statusService,
    historyService,
    controlService,
    controlCoordinator,
    controlAuditRepository,
    controlAuditService,
    auditedControlExecutor,
  };
}

/*
 * A10 durable production entry point.
 *
 * The frozen synchronous createOperationalComposition() remains
 * byte-semantically intact for A8/A9 compatibility callers.
 *
 * Production server startup uses this asynchronous composition so
 * durable scheduler generation identity is loaded before the
 * application lifecycle starts the scheduler.
 */
export type DurableOperationalComposition = {
  scheduler:
    SchedulerRuntime;

  recovery:
    DurableProductionRecoveryControlComposition;

  metrics:
    SchedulerMetricsAccumulator;

  statusService:
    SchedulerStatusService;

  historyService:
    ExecutionHistoryService;

  controlService:
    SchedulerControlService;

  controlCoordinator:
    SchedulerControlCoordinator;

  controlAuditRepository:
    SchedulerControlAuditRepository;

  controlAuditService:
    SchedulerControlAuditService;

  auditedControlExecutor:
    AuditedSchedulerControlExecutor;
};


export async function createDurableOperationalComposition():
  Promise<DurableOperationalComposition> {
  const metrics =
    new SchedulerMetricsAccumulator();

  const dispatcher =
    new TriggerDispatcher();

  const observingDispatcher =
    new MetricsObservingSchedulerDispatcher(
      dispatcher,
      metrics,
    );

  /*
   * Unlike the frozen A9 composition, this construction performs
   * the durable generation read and initializes durable recovery
   * supervision before returning to server bootstrap.
   */
  const recovery =
    await createDurableProductionRecoveryControlComposition(
      observingDispatcher,
    );

  /*
   * Frozen SchedulerRuntime-compatible facade remains the lifecycle,
   * status, metrics and A8 start/stop authority.
   */
  const scheduler =
    recovery.scheduler;

  const statusService =
    new SchedulerStatusService(
      scheduler,
      metrics,
    );

  const historyRepository =
    new AutomationExecutionHistoryRepository();

  const historyService =
    new ExecutionHistoryService(
      historyRepository,
    );

  /*
   * Preserve the legacy A8 start/stop audited path.
   */
  const controlService =
    new SchedulerControlService(
      scheduler,
    );

  const controlCoordinator =
    new SchedulerControlCoordinator(
      controlService,
    );

  const controlAuditRepository =
    new SchedulerControlAuditRepository();

  const controlAuditService =
    new SchedulerControlAuditService(
      controlAuditRepository,
    );

  const auditedControlExecutor =
    new AuditedSchedulerControlExecutor(
      controlCoordinator,
      controlAuditRepository,
    );

  return {
    scheduler,
    recovery,
    metrics,
    statusService,
    historyService,
    controlService,
    controlCoordinator,
    controlAuditRepository,
    controlAuditService,
    auditedControlExecutor,
  };
}
