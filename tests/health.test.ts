import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import { buildApp } from "../src/app.js";
import { closeDatabase } from "../src/database/sqlserver.js";

describe("health API", () => {
  const applications:
    ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(
      applications.map(
        (app) => app.close(),
      ),
    );

    applications.length = 0;

    await closeDatabase();
  });

  it("returns healthy API status", async () => {
    const app = buildApp();
    applications.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(
      response.statusCode,
    ).toBe(200);

    const body = response.json();

    expect(body.status).toBe("ok");
    expect(body.service).toBe(
      "automation-platform-api",
    );
  });

  it(
    "returns healthy database status",
    async () => {
      const app = buildApp();
      applications.push(app);

      const response = await app.inject({
        method: "GET",
        url: "/health/database",
      });

      expect(
        response.statusCode,
      ).toBe(200);

      const body = response.json();

      expect(body.status).toBe("ok");

      expect(
        body.database.enabled,
      ).toBe(true);

      expect(
        body.database.connected,
      ).toBe(true);

      expect(
        body.database.database,
      ).toBe("AutomationPlatform");
    },
    15_000,
  );
});
