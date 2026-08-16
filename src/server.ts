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
  ApplicationLifecycle,
} from "./runtime/application_lifecycle.js";


const operational =
  await createDurableOperationalComposition();


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

    schedulerRecoveryControl,

    schedulerControlAudit:
      operational.controlAuditService,
  });


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
