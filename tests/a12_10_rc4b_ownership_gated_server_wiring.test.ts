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
  "A12.10 RC4B ownership-gated production server wiring",
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
      "acquires ownership before HTTP listen",
      () => {

        const ownershipStart =
          serverSource.indexOf(
            "await ownershipRuntime.start()",
          );

        const listen =
          serverSource.indexOf(
            "await app.listen",
          );


        expect(ownershipStart)
          .toBeGreaterThanOrEqual(0);

        expect(listen)
          .toBeGreaterThan(
            ownershipStart,
          );
      },
    );


    it(
      "fails closed when ownership cannot start",
      () => {

        expect(serverSource)
          .toContain(
            "ownershipStart.kind !==",
          );

        expect(serverSource)
          .toContain(
            "Production scheduler ownership acquisition failed",
          );
      },
    );


    it(
      "routes lifecycle shutdown through ownership release",
      () => {

        expect(serverSource)
          .toContain(
            "await ownershipRuntime.stop()",
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