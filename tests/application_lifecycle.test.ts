import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ApplicationLifecycle,
} from "../src/runtime/application_lifecycle.js";

class FakeScheduler {
  public starts =
    0;

  public stops =
    0;

  public failure:
    Error | null =
    null;

  public readonly order:
    string[];

  public constructor(
    order:
      string[],
  ) {
    this.order =
      order;
  }

  public start(): void {
    this.starts++;

    this.order.push(
      "scheduler.start",
    );
  }

  public async stop():
    Promise<void> {
    this.stops++;

    this.order.push(
      "scheduler.stop",
    );

    if (this.failure) {
      throw this.failure;
    }
  }
}

class FakeServer {
  public closes =
    0;

  public failure:
    Error | null =
    null;

  public readonly order:
    string[];

  public constructor(
    order:
      string[],
  ) {
    this.order =
      order;
  }

  public async close():
    Promise<void> {
    this.closes++;

    this.order.push(
      "server.close",
    );

    if (this.failure) {
      throw this.failure;
    }
  }
}

describe(
  "ApplicationLifecycle",
  () => {
    it(
      "starts the scheduler exactly once",
      () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        const server =
          new FakeServer(
            order,
          );

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {},
          );

        lifecycle.start();

        expect(lifecycle.state)
          .toBe(
            "running",
          );

        expect(scheduler.starts)
          .toBe(1);

        expect(order)
          .toEqual([
            "scheduler.start",
          ]);
      },
    );

    it(
      "rejects duplicate application start",
      () => {
        const lifecycle =
          new ApplicationLifecycle(
            new FakeScheduler([]),
            new FakeServer([]),
            async () => {},
          );

        lifecycle.start();

        expect(
          () =>
            lifecycle.start(),
        ).toThrow(
          "ApplicationLifecycle can only be started once.",
        );
      },
    );

    it(
      "shuts down scheduler before server and database",
      async () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        const server =
          new FakeServer(
            order,
          );

        let databaseCloses =
          0;

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              databaseCloses++;

              order.push(
                "database.close",
              );
            },
          );

        lifecycle.start();

        await lifecycle.stop();

        expect(lifecycle.state)
          .toBe(
            "stopped",
          );

        expect(scheduler.stops)
          .toBe(1);

        expect(server.closes)
          .toBe(1);

        expect(databaseCloses)
          .toBe(1);

        expect(order)
          .toEqual([
            "scheduler.start",
            "scheduler.stop",
            "server.close",
            "database.close",
          ]);
      },
    );

    it(
      "makes application stop idempotent",
      async () => {
        const scheduler =
          new FakeScheduler([]);

        const server =
          new FakeServer([]);

        let databaseCloses =
          0;

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              databaseCloses++;
            },
          );

        lifecycle.start();

        const first =
          lifecycle.stop();

        const second =
          lifecycle.stop();

        expect(second)
          .toBe(first);

        await first;
        await second;

        expect(scheduler.stops)
          .toBe(1);

        expect(server.closes)
          .toBe(1);

        expect(databaseCloses)
          .toBe(1);
      },
    );

    it(
      "still closes server and database when scheduler stop fails",
      async () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        scheduler.failure =
          new Error(
            "scheduler stop failure",
          );

        const server =
          new FakeServer(
            order,
          );

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              order.push(
                "database.close",
              );
            },
          );

        lifecycle.start();

        await expect(
          lifecycle.stop(),
        ).rejects.toThrow(
          "scheduler stop failure",
        );

        expect(order)
          .toEqual([
            "scheduler.start",
            "scheduler.stop",
            "server.close",
            "database.close",
          ]);

        expect(lifecycle.state)
          .toBe(
            "stopped",
          );
      },
    );

    it(
      "still closes database when server close fails",
      async () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        const server =
          new FakeServer(
            order,
          );

        server.failure =
          new Error(
            "server close failure",
          );

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              order.push(
                "database.close",
              );
            },
          );

        lifecycle.start();

        await expect(
          lifecycle.stop(),
        ).rejects.toThrow(
          "server close failure",
        );

        expect(order)
          .toEqual([
            "scheduler.start",
            "scheduler.stop",
            "server.close",
            "database.close",
          ]);
      },
    );

    it(
      "aggregates multiple shutdown failures after attempting every resource",
      async () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        scheduler.failure =
          new Error(
            "scheduler failure",
          );

        const server =
          new FakeServer(
            order,
          );

        server.failure =
          new Error(
            "server failure",
          );

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              order.push(
                "database.close",
              );

              throw new Error(
                "database failure",
              );
            },
          );

        lifecycle.start();

        let thrown:
          unknown;

        try {
          await lifecycle.stop();
        }
        catch (error) {
          thrown =
            error;
        }

        expect(thrown)
          .toBeInstanceOf(
            AggregateError,
          );

        const aggregate =
          thrown as AggregateError;

        expect(aggregate.errors)
          .toHaveLength(3);

        expect(order)
          .toEqual([
            "scheduler.start",
            "scheduler.stop",
            "server.close",
            "database.close",
          ]);
      },
    );

    it(
      "can close resources safely when startup has not begun",
      async () => {
        const order:
          string[] = [];

        const scheduler =
          new FakeScheduler(
            order,
          );

        const server =
          new FakeServer(
            order,
          );

        const lifecycle =
          new ApplicationLifecycle(
            scheduler,
            server,
            async () => {
              order.push(
                "database.close",
              );
            },
          );

        await lifecycle.stop();

        expect(scheduler.starts)
          .toBe(0);

        expect(scheduler.stops)
          .toBe(1);

        expect(server.closes)
          .toBe(1);

        expect(order)
          .toEqual([
            "scheduler.stop",
            "server.close",
            "database.close",
          ]);

        expect(lifecycle.state)
          .toBe(
            "stopped",
          );
      },
    );
  },
);
