import {
  minimumIntervalSeconds,
  type IntervalScheduleConfiguration,
  type Schedule,
} from "./schedule_contract.js";

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertExactProperties(
  value: Record<string, unknown>,
  allowedProperties: readonly string[],
): void {
  const unexpectedProperties =
    Object.keys(value).filter(
      (property) =>
        !allowedProperties.includes(property),
    );

  if (unexpectedProperties.length !== 0) {
    throw new Error(
      `Unsupported schedule configuration property: ${unexpectedProperties[0]}.`,
    );
  }
}

function parseIntervalConfiguration(
  value: Record<string, unknown>,
): IntervalScheduleConfiguration {
  assertExactProperties(
    value,
    ["intervalSeconds"],
  );

  const intervalSeconds =
    value.intervalSeconds;

  if (
    typeof intervalSeconds !== "number" ||
    !Number.isInteger(intervalSeconds)
  ) {
    throw new Error(
      "intervalSeconds must be an integer.",
    );
  }

  if (
    intervalSeconds <
    minimumIntervalSeconds
  ) {
    throw new Error(
      `intervalSeconds must be at least ${minimumIntervalSeconds}.`,
    );
  }

  return {
    intervalSeconds,
  };
}

export function parseScheduleConfiguration(
  configurationJson: string,
): Schedule {
  let parsed: unknown;

  try {
    parsed =
      JSON.parse(configurationJson);
  }
  catch {
    throw new Error(
      "Schedule configuration must be valid JSON.",
    );
  }

  if (!isJsonObject(parsed)) {
    throw new Error(
      "Schedule configuration must be a JSON object.",
    );
  }

  const configuration =
    parseIntervalConfiguration(parsed);

  return {
    kind: "interval",
    intervalSeconds:
      configuration.intervalSeconds,
  };
}
