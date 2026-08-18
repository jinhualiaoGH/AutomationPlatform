import {
  buildApp,
} from "./app.js";

import {
  environment,
} from "./config/environment.js";

import {
  closeDatabase,
} from "./database/sqlserver.js";

import {
  createDurableOperationalComposition,
} from "./operations/operational_composition.js";

import {
  SchedulerRecoveryHttpGateway,
} from "./routes/scheduler_recovery_control.js";

import {
  composeProductionDurableRecoveryCoordination,
} from "./recovery/production_durable_recovery_coordination_composition.js";

import {
  composeProductionCoordinatedRecoveryControlService,
} from "./recovery/production_coordinated_recovery_control_service_composition.js";

import {
  composeProductionCoordinatedRecoveryControl,
} from "./recovery/production_coordinated_recovery_control_composition.js";

import {
  composeProductionAuditedCoordinatedRecoveryControl,
} from "./recovery/production_audited_coordinated_recovery_control_composition.js";

import {
  composeProductionCoordinatedRecoveryHttp,
} from "./recovery/production_coordinated_recovery_http_composition.js";

import {
  ApplicationLifecycle,
} from "./runtime/application_lifecycle.js";

import {
  composeProductionSchedulerOwnershipRuntime,
} from "./recovery/production_scheduler_ownership_runtime_composition.js";

import {
  composeProductionSchedulerFailoverRuntime,
} from "./recovery/production_scheduler_failover_composition.js";

import {
  SchedulerFailoverOperationalStatusProjector,
} from "./recovery/scheduler_failover_operational_status.js";

import {
  FailoverAwareSchedulerStatusService,
} from "./recovery/failover_aware_scheduler_status_service.js";

import {
  SchedulerFailoverReadinessService,
} from "./recovery/scheduler_failover_readiness_service.js";

import {
  ReadinessAwareCoordinatedSchedulerControlExecutor,
} from "./recovery/readiness_aware_coordinated_control_executor.js";

import {
  MetricsObservingReadinessAwareCoordinatedControlExecutor,
} from "./recovery/metrics_observing_readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "./recovery/scheduler_control_admission_metrics.js";

import {
  SchedulerControlAdmissionStatusService,
} from "./recovery/scheduler_control_admission_status_service.js";

import {
  createSchedulerControlAdmissionStatusRoutes,
} from "./routes/scheduler_control_admission_status.js";

import {
  DurableEventObservingReadinessAwareCoordinatedControlExecutor,
} from "./recovery/durable_event_observing_readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionEventHistory,
} from "./recovery/scheduler_control_admission_event_history.js";

import {
  SqlSchedulerControlAdmissionEventRepository,
} from "./repositories/scheduler_control_admission_event_repository.js";

import {
  SchedulerControlAdmissionHistoryStatusService,
} from "./recovery/scheduler_control_admission_history_status_service.js";

import {
  createSchedulerControlAdmissionHistoryRoutes,
} from "./routes/scheduler_control_admission_history.js";

import {
  createSchedulerReadinessRoutes,
} from "./routes/scheduler_readiness.js";

import {
  resolveProductionSchedulerOwnershipIdentity,
} from "./recovery/production_scheduler_ownership_identity.js";


const operational =
  await createDurableOperationalComposition();

const coordinatedRecovery =
  composeProductionDurableRecoveryCoordination(
    operational.recovery,
  );


const coordinatedControlService =
  composeProductionCoordinatedRecoveryControlService(
    coordinatedRecovery,
  );


const coordinatedControl =
  composeProductionCoordinatedRecoveryControl(
    coordinatedControlService,
  );


const auditedCoordinatedControl =
  composeProductionAuditedCoordinatedRecoveryControl(
    coordinatedControl,
  );



const schedulerRecoveryControl =
  new SchedulerRecoveryHttpGateway(
    operational.auditedControlExecutor,
    operational.recovery.auditedExecutor,
  );


const ownershipIdentity =
  resolveProductionSchedulerOwnershipIdentity();


const ownershipRuntime =
  composeProductionSchedulerOwnershipRuntime(
    operational.dispatcher,
    {
      generation:
        ownershipIdentity.generation,

      ownerId:
        ownershipIdentity.ownerId,

      leaseDurationMs:
        ownershipIdentity.leaseDurationMs,

      renewalIntervalMs:
        ownershipIdentity.renewalIntervalMs,
    },
  );


const schedulerFailover =
  composeProductionSchedulerFailoverRuntime(
    ownershipRuntime,
    {
      generation:
        ownershipIdentity.generation,

      ownerId:
        ownershipIdentity.ownerId,

      leaseDurationMs:
        ownershipIdentity.leaseDurationMs,
    },
    {
      /*
       * A14.3:
       *
       * Reuse the validated production renewal cadence as the
       * initial standby acquisition cadence. A dedicated external
       * acquisition-cadence setting can be introduced later without
       * changing the A14 failover contract.
       */
      acquisitionIntervalMs:
        ownershipIdentity.renewalIntervalMs,
    },
  );



const schedulerFailoverStatus =
  new SchedulerFailoverOperationalStatusProjector(
    schedulerFailover.runtime,
  );


const schedulerReadiness =
  new SchedulerFailoverReadinessService(
    schedulerFailoverStatus,
  );


const readinessAwareCoordinatedControl =
  new ReadinessAwareCoordinatedSchedulerControlExecutor(
    auditedCoordinatedControl.auditedExecutor,
    schedulerReadiness,
  );


const schedulerControlAdmissionHistory =
  new SchedulerControlAdmissionEventHistory(
    256,
  );


const schedulerControlAdmissionEventRepository =
  new SqlSchedulerControlAdmissionEventRepository();


const eventObservingCoordinatedControl =
  new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
    readinessAwareCoordinatedControl,
    schedulerControlAdmissionHistory,
    schedulerControlAdmissionEventRepository,
    undefined,
    (error) => {

      app.log.error(
        error,
        "Scheduler control admission event persistence failed.",
      );
    },
  );


const schedulerControlAdmissionMetrics =
  new SchedulerControlAdmissionMetricsAccumulator();


const metricsObservingCoordinatedControl =
  new MetricsObservingReadinessAwareCoordinatedControlExecutor(
    eventObservingCoordinatedControl,
    schedulerControlAdmissionMetrics,
  );


const schedulerControlAdmissionStatus =
  new SchedulerControlAdmissionStatusService(
    schedulerControlAdmissionMetrics,
  );


const schedulerControlAdmissionHistoryStatus =
  new SchedulerControlAdmissionHistoryStatusService(
    schedulerControlAdmissionHistory,
  );


const coordinatedHttp =
  composeProductionCoordinatedRecoveryHttp(
    auditedCoordinatedControl,
    metricsObservingCoordinatedControl,
  );


const failoverAwareSchedulerStatus =
  new FailoverAwareSchedulerStatusService(
    operational.statusService,
    schedulerFailoverStatus,
  );


const app =
  buildApp({
    schedulerStatus:
      failoverAwareSchedulerStatus,

    executionHistory:
      operational.historyService,

    schedulerControlAudit:
      operational.controlAuditService,
  });


app.register(
  createSchedulerReadinessRoutes(
    schedulerReadiness,
  ),
);

app.register(
  createSchedulerControlAdmissionStatusRoutes(
    schedulerControlAdmissionStatus,
  ),
);


app.register(
  createSchedulerControlAdmissionHistoryRoutes(
    schedulerControlAdmissionHistoryStatus,
  ),
);

app.register(
  coordinatedHttp.commandRoutes,
);


app.register(
  coordinatedHttp.coordinationAuditRoutes,
);
/*
 * A14.3:
 *
 * ApplicationLifecycle retains application/server/database shutdown
 * ordering. Scheduler authority is now supervised by the production
 * failover runtime:
 *
 * standby -> acquire -> active -> fail_closed -> standby.
 *
 * Initial ownership contention is therefore a healthy standby state,
 * not an application-startup failure.
 */
const lifecycle =
  new ApplicationLifecycle(
    {
      start() {
        /*
         * Intentionally empty.
         *
         * Scheduler supervision is started explicitly after the
         * application lifecycle is established.
         */
      },

      async stop() {
        await schedulerFailover.runtime.stop();
      },
    },
    app,
    closeDatabase,
  );


let shutdownStarted =
  false;


async function shutdown(
  signal: string,
): Promise<void> {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted =
    true;

  app.log.info(
    {
      signal,
    },
    "Shutdown requested",
  );

  try {
    await lifecycle.stop();

    process.exit(0);
  }
  catch (error) {
    app.log.error(
      error,
      "Graceful shutdown failed",
    );

    process.exit(1);
  }
}


process.once(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);


process.once(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);


try {
  /*
   * Establish application shutdown ownership first.
   *
   * The production failover runtime is then started without awaiting
   * durable scheduler ownership. This allows the process to remain
   * healthy while operating in standby.
   */
  lifecycle.start();


  /*
   * Intentionally do not await this supervision promise.
   *
   * start() synchronously establishes running supervision while the
   * acquisition/reacquisition loop continues asynchronously.
   */
  void schedulerFailover.runtime.start();


  await app.listen({
    host:
      environment.server.host,

    port:
      environment.server.port,
  });
}
catch (error) {
  app.log.error(
    error,
    "Application startup failed",
  );

  try {
    await lifecycle.stop();
  }
  catch (shutdownError) {
    app.log.error(
      shutdownError,
      "Startup rollback failed",
    );
  }

  process.exit(1);
}
