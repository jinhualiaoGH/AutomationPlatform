import {
  readFile,
} from "node:fs/promises";

import {
  describe,
  expect,
  it,
} from "vitest";


describe(
  "A11.10 production server wiring",
  () => {

    it(
      "layers A11 coordination over the existing A10 recovery graph",
      async () => {

        const source =
          await readFile(
            new URL(
              "../src/server.ts",
              import.meta.url,
            ),
            "utf8",
          );


        expect(source)
          .toContain(
            "composeProductionDurableRecoveryCoordination",
          );


        expect(source)
          .toContain(
            "operational.recovery",
          );


        expect(source)
          .toContain(
            "composeProductionCoordinatedRecoveryControlService",
          );


        expect(source)
          .toContain(
            "composeProductionCoordinatedRecoveryControl(",
          );


        expect(source)
          .toContain(
            "composeProductionAuditedCoordinatedRecoveryControl",
          );


        expect(source)
          .toContain(
            "composeProductionCoordinatedRecoveryHttp",
          );
      },
    );


    it(
      "registers exactly the A11 command and coordination-audit HTTP plugins",
      async () => {

        const source =
          await readFile(
            new URL(
              "../src/server.ts",
              import.meta.url,
            ),
            "utf8",
          );


        expect(source)
          .toContain(
            "coordinatedHttp.commandRoutes",
          );


        expect(source)
          .toContain(
            "coordinatedHttp.coordinationAuditRoutes",
          );


        expect(source)
          .not
          .toMatch(
            /schedulerRecoveryControl:\s*/,
          );
      },
    );


    it(
      "keeps application lifecycle while production scheduler authority is ownership-gated",
      async () => {

        const source =
          await readFile(
            new URL(
              "../src/server.ts",
              import.meta.url,
            ),
            "utf8",
          );


        expect(source)
          .toContain(
            "const ownershipRuntime =",
          );


        expect(source)
          .toContain(
            "composeProductionSchedulerOwnershipRuntime(",
          );


        expect(source)
          .not
          .toContain(
            "const scheduler =",
          );


        expect(source)
          .toContain(
            "new ApplicationLifecycle(",
          );


        expect(source)
          .toContain(
            "lifecycle.start()",
          );
      },
    );
  },
);
