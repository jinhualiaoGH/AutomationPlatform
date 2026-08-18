import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const operationalComposition =
  readFileSync(
    new URL(
      "../src/operations/operational_composition.ts",
      import.meta.url,
    ),
    "utf8",
  );


const server =
  readFileSync(
    new URL(
      "../src/server.ts",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "A12.10 production ownership wiring seam",
  () => {

    it(
      "exposes the existing durable dispatcher for production ownership",
      () => {

        expect(
          operationalComposition,
        ).toContain(
          "dispatcher:",
        );

        expect(server)
          .toContain(
            "operational.dispatcher",
          );

        expect(server)
          .toContain(
            "composeProductionSchedulerOwnershipRuntime",
          );
      },
    );


    it(
      "keeps ownership on the existing operational graph",
      () => {

        expect(server)
          .not.toContain(
            "new TriggerDispatcher(",
          );

        expect(server)
          .not.toContain(
            "new SchedulerRuntime(",
          );

        expect(server)
          .not.toMatch(
            /const\s+scheduler\s*=\s*operational\.scheduler/,
          );
      },
    );


    it(
      "delegates production ownership startup to failover supervision",
      () => {

        expect(server)
          .toContain(
            "composeProductionSchedulerFailoverRuntime",
          );

        expect(server)
          .toContain(
            "void schedulerFailover.runtime.start();",
          );

        expect(server)
          .not.toContain(
            "await ownershipRuntime.start()",
          );

        expect(server)
          .not.toContain(
            "ownershipStart.kind !==",
          );
      },
    );


    it(
      "keeps HTTP startup available while scheduler ownership is supervised",
      () => {

        const failoverStart =
          server.indexOf(
            "void schedulerFailover.runtime.start();",
          );

        const listen =
          server.indexOf(
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
      "routes production shutdown through failover supervision",
      () => {

        expect(server)
          .toContain(
            "await schedulerFailover.runtime.stop();",
          );

        expect(server)
          .not.toContain(
            "await ownershipRuntime.stop();",
          );
      },
    );
  },
);
