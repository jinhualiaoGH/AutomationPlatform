import {
  readFile,
} from "node:fs/promises";

import {
  describe,
  expect,
  it,
} from "vitest";


const serverSource =
  await readFile(
    new URL(
      "../src/server.ts",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "production scheduler failover server wiring",
  () => {

    it(
      "composes the production failover runtime",
      () => {

        expect(serverSource)
          .toContain(
            "composeProductionSchedulerFailoverRuntime",
          );

        expect(serverSource)
          .toContain(
            "const schedulerFailover =",
          );
      },
    );


    it(
      "binds failover to the production ownership runtime",
      () => {

        expect(serverSource)
          .toMatch(
            /composeProductionSchedulerFailoverRuntime\(\s*ownershipRuntime,/,
          );
      },
    );


    it(
      "uses the production ownership coordinates for standby acquisition",
      () => {

        expect(serverSource)
          .toContain(
            "generation:" +
            "\n        ownershipIdentity.generation",
          );

        expect(serverSource)
          .toContain(
            "ownerId:" +
            "\n        ownershipIdentity.ownerId",
          );

        expect(serverSource)
          .toContain(
            "leaseDurationMs:" +
            "\n        ownershipIdentity.leaseDurationMs",
          );
      },
    );


    it(
      "does not perform fatal direct ownership startup",
      () => {

        expect(serverSource)
          .not.toContain(
            "const ownershipStart =",
          );

        expect(serverSource)
          .not.toContain(
            "Production scheduler ownership acquisition failed",
          );

        expect(serverSource)
          .not.toContain(
            "await ownershipRuntime.start()",
          );
      },
    );


    it(
      "starts failover supervision without awaiting ownership",
      () => {

        expect(serverSource)
          .toContain(
            "void schedulerFailover.runtime.start();",
          );

        expect(serverSource)
          .not.toContain(
            "await schedulerFailover.runtime.start()",
          );
      },
    );


    it(
      "starts the application lifecycle before failover supervision",
      () => {

        const lifecycleStart =
          serverSource.indexOf(
            "lifecycle.start();",
          );

        const failoverStart =
          serverSource.indexOf(
            "void schedulerFailover.runtime.start();",
          );


        expect(lifecycleStart)
          .toBeGreaterThan(-1);

        expect(failoverStart)
          .toBeGreaterThan(-1);

        expect(lifecycleStart)
          .toBeLessThan(failoverStart);
      },
    );


    it(
      "stops the failover runtime through ApplicationLifecycle",
      () => {

        expect(serverSource)
          .toContain(
            "await schedulerFailover.runtime.stop();",
          );

        expect(serverSource)
          .not.toContain(
            "await ownershipRuntime.stop();",
          );
      },
    );


    it(
      "continues to listen after starting failover supervision",
      () => {

        const failoverStart =
          serverSource.indexOf(
            "void schedulerFailover.runtime.start();",
          );

        const listen =
          serverSource.indexOf(
            "await app.listen({",
          );


        expect(failoverStart)
          .toBeGreaterThan(-1);

        expect(listen)
          .toBeGreaterThan(-1);

        expect(failoverStart)
          .toBeLessThan(listen);
      },
    );
  },
);
