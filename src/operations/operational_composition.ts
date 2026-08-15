import {
  ExecutionHistoryService,
} from "./execution_history_service.js";

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
  SchedulerPollingLoop,
} from "../scheduling/scheduler_polling_loop.js";

import {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";

import {
  TriggerDispatcher,
} from "../scheduling/trigger_dispatcher.js";

export type OperationalComposition = {
  scheduler:
    SchedulerRuntime;

  metrics:
    SchedulerMetricsAccumulator;

  statusService:
    SchedulerStatusService;

  historyService:
    ExecutionHistoryService;
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

  const pollingLoop =
    new SchedulerPollingLoop(
      observingDispatcher,
    );

  const scheduler =
    new SchedulerRuntime(
      pollingLoop,
    );

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

  return {
    scheduler,
    metrics,
    statusService,
    historyService,
  };
}
