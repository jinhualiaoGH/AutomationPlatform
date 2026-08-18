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
  "production scheduler control admission durability wiring",
  () => {

    it(
      "constructs the SQL admission-event repository",
      () => {

        expect(server)
          .toMatch(
            /new SqlSchedulerControlAdmissionEventRepository\(\)/,
          );
      },
    );


    it(
      "uses the durable observer instead of the A19 in-memory-only observer",
      () => {

        expect(server)
          .toMatch(
            /new DurableEventObservingReadinessAwareCoordinatedControlExecutor\(/,
          );

        expect(server)
          .not.toMatch(
            /new EventObservingReadinessAwareCoordinatedControlExecutor\(/,
          );
      },
    );


    it(
      "feeds the frozen A19 history into the durable observer",
      () => {

        expect(server)
          .toMatch(
            /new DurableEventObservingReadinessAwareCoordinatedControlExecutor\(\s*readinessAwareCoordinatedControl,\s*schedulerControlAdmissionHistory,\s*schedulerControlAdmissionEventRepository,/,
          );
      },
    );


    it(
      "uses exactly one production admission observer",
      () => {

        const durableMatches =
          server.match(
            /new DurableEventObservingReadinessAwareCoordinatedControlExecutor\(/g,
          ) ??
          [];

        const legacyMatches =
          server.match(
            /new EventObservingReadinessAwareCoordinatedControlExecutor\(/g,
          ) ??
          [];


        expect(durableMatches)
          .toHaveLength(
            1,
          );

        expect(legacyMatches)
          .toHaveLength(
            0,
          );
      },
    );


    it(
      "keeps A18 metrics observation outside the durable observer",
      () => {

        expect(server)
          .toMatch(
            /new MetricsObservingReadinessAwareCoordinatedControlExecutor\(\s*eventObservingCoordinatedControl,\s*schedulerControlAdmissionMetrics,/,
          );
      },
    );


    it(
      "preserves the established HTTP delegate",
      () => {

        expect(server)
          .toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*metricsObservingCoordinatedControl,/,
          );
      },
    );


    it(
      "logs durable persistence failure without replacing the control result",
      () => {

        expect(server)
          .toContain(
            "Scheduler control admission event persistence failed.",
          );

        expect(server)
          .toMatch(
            /app\.log\.error\(\s*error,\s*"Scheduler control admission event persistence failed\.",\s*\)/,
          );
      },
    );


    it(
      "keeps the same bounded A19 history for operational status",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionHistoryStatusService\(\s*schedulerControlAdmissionHistory,/,
          );
      },
    );


    it(
      "keeps production history capacity bounded to 256",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionEventHistory\(\s*256,\s*\)/,
          );
      },
    );


    it(
      "orders readiness, durable history, metrics, and HTTP correctly",
      () => {

        const readinessIndex =
          server.indexOf(
            "const readinessAwareCoordinatedControl",
          );

        const historyIndex =
          server.indexOf(
            "const schedulerControlAdmissionHistory",
          );

        const repositoryIndex =
          server.indexOf(
            "const schedulerControlAdmissionEventRepository",
          );

        const observerIndex =
          server.indexOf(
            "const eventObservingCoordinatedControl",
          );

        const metricsIndex =
          server.indexOf(
            "const metricsObservingCoordinatedControl",
          );

        const httpIndex =
          server.indexOf(
            "const coordinatedHttp",
          );


        expect(readinessIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(historyIndex)
          .toBeGreaterThan(
            readinessIndex,
          );

        expect(repositoryIndex)
          .toBeGreaterThan(
            historyIndex,
          );

        expect(observerIndex)
          .toBeGreaterThan(
            repositoryIndex,
          );

        expect(metricsIndex)
          .toBeGreaterThan(
            observerIndex,
          );

        expect(httpIndex)
          .toBeGreaterThan(
            metricsIndex,
          );
      },
    );
  },
);
