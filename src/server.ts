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


const coordinatedHttp =
  composeProductionCoordinatedRecoveryHttp(
    auditedCoordinatedControl,
  );


const schedulerRecoveryControl =
  new SchedulerRecoveryHttpGateway(
    operational.auditedControlExecutor,
    operational.recovery.auditedExecutor,
  );


const app =
  buildApp({
    schedulerStatus:
      operational.statusService,

    executionHistory:
      operational.historyService,

    schedulerControlAudit:
      operational.controlAuditService,
  });

app.register(
  coordinatedHttp.commandRoutes,
);


app.register(
  coordinatedHttp.coordinationAuditRoutes,
);


const scheduler =
  operational.scheduler;


const lifecycle =
  new ApplicationLifecycle(
    scheduler,
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
  lifecycle.start();

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
