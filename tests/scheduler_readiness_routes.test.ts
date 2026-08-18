import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  SchedulerFailoverReadiness,
} from "../src/recovery/scheduler_failover_readiness.js";

import type {
  SchedulerFailoverReadinessReader,
} from "../src/recovery/scheduler_failover_readiness_service.js";

import {
  createSchedulerReadinessRoutes,
} from "../src/routes/scheduler_readiness.js";


class FakeReadinessReader
implements SchedulerFailoverReadinessReader {

  public calls =
    0;


  public value:
    SchedulerFailoverReadiness = {
      ready:
        false,

      state:
        "standby",

      reason:
        "scheduler_standby",
    };


  public snapshot():
    SchedulerFailoverReadiness {

    this.calls +=
      1;

    return this.value;
  }
}


const apps:
  ReturnType<typeof Fastify>[] =
  [];


async function createApp(
  reader:
    SchedulerFailoverReadinessReader,
) {

  const app =
    Fastify();

  apps.push(app);

  await app.register(
    createSchedulerReadinessRoutes(
      reader,
    ),
  );

  await app.ready();

  return app;
}


afterEach(
  async () => {

    while (apps.length > 0) {

      const app =
        apps.pop();

      if (app) {
        await app.close();
      }
    }
  },
);


describe(
  "scheduler readiness routes",
  () => {

    it(
      "returns active scheduler readiness",
      async () => {

        const reader =
          new FakeReadinessReader();

        reader.value = {
          ready:
            true,

          state:
            "ready",

          reason:
            "scheduler_active",
        };


        const app =
          await createApp(
            reader,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(response.statusCode)
          .toBe(200);

        expect(response.json())
          .toEqual({
            ready:
              true,

            state:
              "ready",

            reason:
              "scheduler_active",
          });
      },
    );


    it(
      "returns standby readiness without transport failure",
      async () => {

        const reader =
          new FakeReadinessReader();


        const app =
          await createApp(
            reader,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(response.statusCode)
          .toBe(200);

        expect(response.json())
          .toEqual({
            ready:
              false,

            state:
              "standby",

            reason:
              "scheduler_standby",
          });
      },
    );


    it(
      "returns fail-closed readiness without transport failure",
      async () => {

        const reader =
          new FakeReadinessReader();

        reader.value = {
          ready:
            false,

          state:
            "fail_closed",

          reason:
            "scheduler_fail_closed",
        };


        const app =
          await createApp(
            reader,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(response.statusCode)
          .toBe(200);

        expect(response.json())
          .toEqual({
            ready:
              false,

            state:
              "fail_closed",

            reason:
              "scheduler_fail_closed",
          });
      },
    );


    it(
      "returns stopped readiness without transport failure",
      async () => {

        const reader =
          new FakeReadinessReader();

        reader.value = {
          ready:
            false,

          state:
            "stopped",

          reason:
            "scheduler_stopped",
        };


        const app =
          await createApp(
            reader,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(response.statusCode)
          .toBe(200);

        expect(response.json())
          .toEqual({
            ready:
              false,

            state:
              "stopped",

            reason:
              "scheduler_stopped",
          });
      },
    );


    it(
      "reads current readiness on every request",
      async () => {

        const reader =
          new FakeReadinessReader();

        const app =
          await createApp(
            reader,
          );


        const first =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(first.json())
          .toMatchObject({
            ready:
              false,

            state:
              "standby",
          });


        reader.value = {
          ready:
            true,

          state:
            "ready",

          reason:
            "scheduler_active",
        };


        const second =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness",
          });


        expect(second.json())
          .toEqual({
            ready:
              true,

            state:
              "ready",

            reason:
              "scheduler_active",
          });

        expect(reader.calls)
          .toBe(2);
      },
    );


    it(
      "does not expose readiness endpoint on unrelated paths",
      async () => {

        const reader =
          new FakeReadinessReader();

        const app =
          await createApp(
            reader,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/readiness/unknown",
          });


        expect(response.statusCode)
          .toBe(404);
      },
    );
  },
);
