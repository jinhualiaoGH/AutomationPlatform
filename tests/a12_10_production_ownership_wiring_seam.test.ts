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
      "gates production startup on durable ownership",
      () => {

        const ownershipStart =
          server.indexOf(
            "await ownershipRuntime.start()",
          );

        const listen =
          server.indexOf(
            "await app.listen",
          );

        expect(ownershipStart)
          .toBeGreaterThanOrEqual(0);

        expect(listen)
          .toBeGreaterThan(
            ownershipStart,
          );

        expect(server)
          .toContain(
            "ownershipStart.kind !==",
          );
      },
    );


    it(
      "routes production shutdown through ownership release",
      () => {

        expect(server)
          .toContain(
            "await ownershipRuntime.stop()",
          );
      },
    );
  },
);