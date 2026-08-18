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
  "production scheduler control admission durable history wiring",
  () => {

    it(
      "constructs exactly one SQL admission-event repository",
      () => {

        const matches =
          server.match(
            /new SqlSchedulerControlAdmissionEventRepository\(\)/g,
          ) ??
          [];


        expect(matches)
          .toHaveLength(
            1,
          );
      },
    );


    it(
      "constructs the durable-history service from the existing A20 repository",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionDurableHistoryService\(\s*schedulerControlAdmissionEventRepository,\s*256,\s*\)/,
          );
      },
    );


    it(
      "reuses the exact repository instance used by the A20 durable observer",
      () => {

        expect(server)
          .toMatch(
            /new DurableEventObservingReadinessAwareCoordinatedControlExecutor\(\s*readinessAwareCoordinatedControl,\s*schedulerControlAdmissionHistory,\s*schedulerControlAdmissionEventRepository,/,
          );


        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionDurableHistoryService\(\s*schedulerControlAdmissionEventRepository,/,
          );
      },
    );


    it(
      "does not construct a second repository for durable-history reads",
      () => {

        const repositoryConstructionCount =
          (
            server.match(
              /new SqlSchedulerControlAdmissionEventRepository\(\)/g,
            ) ??
            []
          ).length;


        expect(repositoryConstructionCount)
          .toBe(
            1,
          );
      },
    );


    it(
      "registers the durable-history route from the durable-history service",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerControlAdmissionDurableHistoryRoutes\(\s*schedulerControlAdmissionDurableHistory,\s*\)/,
          );
      },
    );


    it(
      "preserves the frozen A19 live-history route",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerControlAdmissionHistoryRoutes\(\s*schedulerControlAdmissionHistoryStatus,\s*\)/,
          );
      },
    );


    it(
      "keeps the A19 and A21 history routes as separate registrations",
      () => {

        const liveIndex =
          server.indexOf(
            "createSchedulerControlAdmissionHistoryRoutes(",
          );

        const durableIndex =
          server.indexOf(
            "createSchedulerControlAdmissionDurableHistoryRoutes(",
          );


        expect(liveIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(durableIndex)
          .toBeGreaterThan(
            liveIndex,
          );
      },
    );


    it(
      "registers durable history before coordinated command routes",
      () => {

        const durableRouteIndex =
          server.indexOf(
            "createSchedulerControlAdmissionDurableHistoryRoutes(",
          );

        const commandRouteIndex =
          server.indexOf(
            "coordinatedHttp.commandRoutes",
          );


        expect(durableRouteIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(commandRouteIndex)
          .toBeGreaterThan(
            durableRouteIndex,
          );
      },
    );


    it(
      "keeps A21 read composition outside the scheduler control execution chain",
      () => {

        expect(server)
          .toMatch(
            /new MetricsObservingReadinessAwareCoordinatedControlExecutor\(\s*eventObservingCoordinatedControl,\s*schedulerControlAdmissionMetrics,/,
          );


        expect(server)
          .toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*metricsObservingCoordinatedControl,/,
          );
      },
    );


    it(
      "orders repository, durable read service, observer, and HTTP registration coherently",
      () => {

        const repositoryIndex =
          server.indexOf(
            "const schedulerControlAdmissionEventRepository",
          );

        const durableHistoryIndex =
          server.indexOf(
            "const schedulerControlAdmissionDurableHistory",
          );

        const observerIndex =
          server.indexOf(
            "const eventObservingCoordinatedControl",
          );

        const registrationIndex =
          server.indexOf(
            "createSchedulerControlAdmissionDurableHistoryRoutes(",
          );


        expect(repositoryIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(durableHistoryIndex)
          .toBeGreaterThan(
            repositoryIndex,
          );

        expect(observerIndex)
          .toBeGreaterThan(
            durableHistoryIndex,
          );

        expect(registrationIndex)
          .toBeGreaterThan(
            observerIndex,
          );
      },
    );
  },
);
