import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const server =
  readFileSync(
    new URL(
      "../src/server.ts",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "production scheduler failover status wiring",
  () => {

    it(
      "imports the failover status projector",
      () => {

        expect(server)
          .toContain(
            "SchedulerFailoverOperationalStatusProjector",
          );
      },
    );


    it(
      "imports the failover-aware scheduler status service",
      () => {

        expect(server)
          .toContain(
            "FailoverAwareSchedulerStatusService",
          );
      },
    );


    it(
      "projects from the live production failover runtime",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerFailoverOperationalStatusProjector\(\s*schedulerFailover\.runtime,\s*\)/,
          );
      },
    );


    it(
      "decorates the operational composition status service",
      () => {

        expect(server)
          .toMatch(
            /new FailoverAwareSchedulerStatusService\(\s*operational\.statusService,\s*schedulerFailoverStatus,\s*\)/,
          );
      },
    );


    it(
      "supplies the decorated status service to buildApp",
      () => {

        expect(server)
          .toMatch(
            /schedulerStatus:\s*failoverAwareSchedulerStatus/,
          );
      },
    );


    it(
      "does not bypass the existing operational status service",
      () => {

        expect(server)
          .toContain(
            "operational.statusService",
          );
      },
    );


    it(
      "constructs failover before its operational projection",
      () => {

        const failoverIndex =
          server.indexOf(
            "const schedulerFailover =",
          );

        const projectionIndex =
          server.indexOf(
            "const schedulerFailoverStatus =",
          );

        expect(failoverIndex)
          .toBeGreaterThanOrEqual(0);

        expect(projectionIndex)
          .toBeGreaterThan(
            failoverIndex,
          );
      },
    );


    it(
      "constructs app after the failover-aware status service",
      () => {

        const decoratorIndex =
          server.indexOf(
            "const failoverAwareSchedulerStatus =",
          );

        const appIndex =
          server.indexOf(
            "const app =",
          );

        expect(decoratorIndex)
          .toBeGreaterThanOrEqual(0);

        expect(appIndex)
          .toBeGreaterThan(
            decoratorIndex,
          );
      },
    );


    it(
      "preserves non-awaited failover supervision startup",
      () => {

        expect(server)
          .toContain(
            "void schedulerFailover.runtime.start();",
          );

        expect(server)
          .not.toContain(
            "await ownershipRuntime.start()",
          );
      },
    );


    it(
      "preserves failover-owned shutdown",
      () => {

        expect(server)
          .toContain(
            "await schedulerFailover.runtime.stop();",
          );
      },
    );
  },
);
