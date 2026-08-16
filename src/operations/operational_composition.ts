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
