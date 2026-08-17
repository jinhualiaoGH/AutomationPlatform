import {
  describe,
  expect,
  it,
} from "vitest";

import {
  MAX_SCHEDULER_OWNER_ID_LENGTH,
  assertCurrentSchedulerFencingToken,
  assertNextSchedulerFencingToken,
  assertSchedulerOwnershipGeneration,
  createDurableSchedulerOwnership,
  isSchedulerOwnershipExpired,
  normalizeSchedulerOwnerId,
} from "../src/recovery/durable_scheduler_ownership_contract.js";


describe(
  "durable scheduler ownership contract",
  () => {

    it(
      "creates a durable scheduler ownership identity",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 7,
            fencingToken: 12,
            ownerId: "process-a",
            leaseExpiresAtEpochMs: 10_000,
          });


        expect(ownership)
          .toEqual({
            generation: 7,
            fencingToken: 12,
            ownerId: "process-a",
            leaseExpiresAtEpochMs: 10_000,
          });


        expect(
          Object.isFrozen(ownership),
        ).toBe(true);
      },
    );


    it(
      "normalizes surrounding owner whitespace",
      () => {

        expect(
          normalizeSchedulerOwnerId(
            "  process-a  ",
          ),
        ).toBe("process-a");
      },
    );


    it.each([
      "",
      " ",
      "   ",
    ])(
      "rejects empty owner id %j",
      (ownerId) => {

        expect(() =>
          normalizeSchedulerOwnerId(
            ownerId,
          ),
        ).toThrow();
      },
    );


    it(
      "rejects an oversized owner id",
      () => {

        expect(() =>
          normalizeSchedulerOwnerId(
            "x".repeat(
              MAX_SCHEDULER_OWNER_ID_LENGTH +
              1,
            ),
          ),
        ).toThrow();
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      "rejects invalid generation %s",
      (generation) => {

        expect(() =>
          createDurableSchedulerOwnership({
            generation,
            fencingToken: 1,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          }),
        ).toThrow();
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      "rejects invalid fencing token %s",
      (fencingToken) => {

        expect(() =>
          createDurableSchedulerOwnership({
            generation: 1,
            fencingToken,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          }),
        ).toThrow();
      },
    );


    it(
      "accepts an exact fencing transition",
      () => {

        expect(() =>
          assertNextSchedulerFencingToken(
            9,
            10,
          ),
        ).not.toThrow();
      },
    );


    it.each([
      [1, 1],
      [2, 1],
      [1, 3],
      [10, 12],
    ])(
      "rejects invalid fencing transition %s -> %s",
      (
        previousToken,
        nextToken,
      ) => {

        expect(() =>
          assertNextSchedulerFencingToken(
            previousToken,
            nextToken,
          ),
        ).toThrow();
      },
    );


    it(
      "rejects fencing token overflow",
      () => {

        expect(() =>
          assertNextSchedulerFencingToken(
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
          ),
        ).toThrow();
      },
    );


    it(
      "treats the lease as active before expiration",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 1,
            fencingToken: 1,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(
          isSchedulerOwnershipExpired(
            ownership,
            99,
          ),
        ).toBe(false);
      },
    );


    it(
      "expires ownership exactly at its expiration boundary",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 1,
            fencingToken: 1,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(
          isSchedulerOwnershipExpired(
            ownership,
            100,
          ),
        ).toBe(true);
      },
    );


    it(
      "accepts matching durable generation identity",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 17,
            fencingToken: 3,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(() =>
          assertSchedulerOwnershipGeneration(
            ownership,
            17,
          ),
        ).not.toThrow();
      },
    );


    it(
      "rejects ownership from another durable generation",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 17,
            fencingToken: 3,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(() =>
          assertSchedulerOwnershipGeneration(
            ownership,
            18,
          ),
        ).toThrow();
      },
    );


    it(
      "accepts the current fencing token",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 1,
            fencingToken: 42,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(() =>
          assertCurrentSchedulerFencingToken(
            ownership,
            42,
          ),
        ).not.toThrow();
      },
    );


    it(
      "rejects a stale fencing token",
      () => {

        const ownership =
          createDurableSchedulerOwnership({
            generation: 1,
            fencingToken: 42,
            ownerId: "owner",
            leaseExpiresAtEpochMs: 100,
          });


        expect(() =>
          assertCurrentSchedulerFencingToken(
            ownership,
            41,
          ),
        ).toThrow(
          "Scheduler fencing token is stale.",
        );
      },
    );
  },
);
