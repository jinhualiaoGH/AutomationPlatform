import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const serverSource =
  readFileSync(
    new URL(
      "../src/server.ts",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "A12.10 RC4B production ownership server wiring",
  () => {

    it(
      "composes ownership from the existing durable dispatcher",
      () => {

        expect(serverSource)
          .toContain(
            "composeProductionSchedulerOwnershipRuntime",
          );

        expect(serverSource)
          .toContain(
            "resolveProductionSchedulerOwnershipIdentity",
          );

        expect(serverSource)
          .toContain(
            "operational.dispatcher",
          );
      },
    );


    it(
      "uses the production identity policy for all ownership options",
      () => {

        expect(serverSource)
          .toContain(
            "ownershipIdentity.generation",
          );

        expect(serverSource)
          .toContain(
            "ownershipIdentity.ownerId",
          );

        expect(serverSource)
          .toContain(
            "ownershipIdentity.leaseDurationMs",
          );

        expect(serverSource)
          .toContain(
            "ownershipIdentity.renewalIntervalMs",
          );
      },
    );


    it(
      "delegates ownership acquisition to the production failover runtime",
      () => {

        expect(serverSource)
          .toContain(
            "composeProductionSchedulerFailoverRuntime",
          );

        expect(serverSource)
          .toMatch(
            /composeProductionSchedulerFailoverRuntime\(\s*ownershipRuntime,/,
          );

        expect(serverSource)
          .toContain(
            "void schedulerFailover.runtime.start();",
          );

        expect(serverSource)
          .not.toContain(
            "await ownershipRuntime.start()",
          );
      },
    );


    it(
      "treats initial ownership contention as supervised standby",
      () => {

        expect(serverSource)
          .not.toContain(
            "ownershipStart.kind !==",
          );

        expect(serverSource)
          .not.toContain(
            "Production scheduler ownership acquisition failed",
          );

        expect(serverSource)
          .toContain(
            "healthy while operating in standby",
          );
      },
    );


    it(
      "starts failover supervision before HTTP listen",
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
          .toBeGreaterThanOrEqual(0);

        expect(listen)
          .toBeGreaterThan(
            failoverStart,
          );
      },
    );


    it(
      "routes lifecycle shutdown through failover supervision",
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
      "removes legacy scheduler startup authority",
      () => {

        expect(serverSource)
          .not.toMatch(
            /const\s+scheduler\s*=\s*operational\.scheduler/,
          );
      },
    );


    it(
      "does not construct a second dispatcher or scheduler runtime in server",
      () => {

        expect(serverSource)
          .not.toContain(
            "new TriggerDispatcher(",
          );

        expect(serverSource)
          .not.toContain(
            "new SchedulerRuntime(",
          );
      },
    );
  },
);
