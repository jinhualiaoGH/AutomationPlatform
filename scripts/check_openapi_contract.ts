/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

type Severity = "PASS" | "REVIEW" | "FAIL";

type Finding = {
  severity: Severity;
  code: string;
  message: string;
};

type OpenApiOperation = {
  method: string;
  path: string;
  key: string;
};

type RuntimeEvidence = {
  method?: string;
  path: string;
  key?: string;
  file: string;
  strength: "strong" | "path-only";
};

type Options = {
  mode: "current" | "frozen";
  sha256?: string;
};

const root = process.cwd();

const contractPath = path.join(
  root,
  "api-contracts",
  "automation-platform-scheduler-admission.openapi.yaml",
);

const routesRoot = path.join(root, "src", "routes");

const negativePaths = new Set([
  "/operations/scheduler/start",
  "/operations/scheduler/stop",
  "/operations/scheduler/pause",
  "/operations/scheduler/resume",
  "/operations/scheduler/restart",
]);

const supportedMethods = [
  "get",
  "post",
  "patch",
  "put",
  "delete",
  "head",
  "options",
];

function failUsage(message: string): never {
  console.error(`[FAIL] usage: ${message}`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const mode = argv[2];

  if (mode !== "current" && mode !== "frozen") {
    failUsage(
      'expected mode "current" or "frozen"',
    );
  }

  let sha256: string | undefined;

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--sha256") {
      const value = argv[i + 1];

      if (!value) {
        failUsage("--sha256 requires a value");
      }

      sha256 = value.toLowerCase();
      i += 1;
      continue;
    }

    failUsage(`unknown argument: ${arg}`);
  }

  if (mode === "frozen" && !sha256) {
    failUsage("frozen mode requires --sha256 <hash>");
  }

  return {
    mode,
    sha256,
  };
}

function normalizeRoutePath(value: string): string {
  const withoutQuery = value.split("?")[0] ?? value;

  return withoutQuery.replace(
    /:([A-Za-z][A-Za-z0-9_]*)/g,
    "{$1}",
  );
}

function sha256(bytes: Buffer): string {
  return crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");
}

function readGitIndexBytes(
  repositoryRelativePath: string,
): Buffer {
  try {
    return execFileSync(
      "git",
      [
        "show",
        `:${repositoryRelativePath}`,
      ],
      {
        cwd: root,
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `unable to read canonical Git-index bytes for ${repositoryRelativePath}: ${detail}`,
    );
  }
}

function walkTsFiles(directory: string): string[] {
  const result: string[] = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...walkTsFiles(full));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(full);
    }
  }

  return result.sort();
}

function relative(file: string): string {
  return path
    .relative(root, file)
    .replaceAll("\\", "/");
}

function extractOpenApi(
  text: string,
): {
  paths: string[];
  operations: OpenApiOperation[];
  operationIds: string[];
} {
  const pathsInSourceOrder = [
    ...text.matchAll(
      /^  (\/[^:]+):\s*$/gm,
    ),
  ].map((match) => match[1]!);

  const paths = [
    ...pathsInSourceOrder,
  ].sort();

  const operationIds = [
    ...text.matchAll(
      /^\s*operationId:\s*(\S+)\s*$/gm,
    ),
  ].map((match) => match[1]!);

  const operations: OpenApiOperation[] = [];

  for (
    let index = 0;
    index < pathsInSourceOrder.length;
    index += 1
  ) {
    const currentPath =
      pathsInSourceOrder[index]!;
    const startMarker = `  ${currentPath}:`;

    const start = text.indexOf(startMarker);

    if (start < 0) {
      continue;
    }

    let end = text.length;

    const nextPath =
      pathsInSourceOrder[index + 1];

    if (nextPath !== undefined) {
      const next =
        text.indexOf(
          `  ${nextPath}:`,
          start + startMarker.length,
        );

      if (next >= 0) {
        end = next;
      }
    }

    const componentsIndex = text.indexOf(
      "\ncomponents:",
      start,
    );

    if (
      componentsIndex >= 0 &&
      componentsIndex < end
    ) {
      end = componentsIndex;
    }

    const block = text.slice(start, end);

    for (const method of supportedMethods) {
      const regex = new RegExp(
        `^    ${method}:\\s*$`,
        "m",
      );

      if (!regex.test(block)) {
        continue;
      }

      const upper = method.toUpperCase();

      operations.push({
        method: upper,
        path: currentPath,
        key: `${upper} ${currentPath}`,
      });
    }
  }

  operations.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.method.localeCompare(b.method),
  );

  return {
    paths,
    operations,
    operationIds,
  };
}

function inspectRuntime(
  files: string[],
): {
  evidence: RuntimeEvidence[];
  unsupported: string[];
} {
  const evidence: RuntimeEvidence[] = [];
  const unsupported = new Set<string>();


  const routeLiteralPattern =
    /["'](\/[^"']+)["']/g;

  for (const file of files) {
    const text = fs.readFileSync(
      file,
      "utf8",
    );

    if (/\.route\s*\(/i.test(text)) {
      unsupported.add(
        `${relative(file)}: app.route/object-form registration`,
      );
    }

    if (/\bprefix\s*:/i.test(text)) {
      unsupported.add(
        `${relative(file)}: route prefix option`,
      );
    }

    const methodRegistrationPattern =
      /\.(get|post|patch|put|delete|head|options)\s*(?:<[\s\S]*?>\s*)?\(/gim;

    for (
      const registration of text.matchAll(
        methodRegistrationPattern,
      )
    ) {
      const argumentStart =
        registration.index! +
        registration[0].length;

      const remainder =
        text.slice(argumentStart);

      const firstArgument =
        remainder.match(/^\s*(.)/s);

      if (
        firstArgument !== null &&
        firstArgument[1] !== `"` &&
        firstArgument[1] !== `'`
      ) {
        unsupported.add(
          `${relative(file)}: non-literal route argument`,
        );
      }
    }

    for (
      const registration of text.matchAll(
        methodRegistrationPattern,
      )
    ) {
      const method =
        registration[1]!.toUpperCase();

      const argumentStart =
        registration.index! +
        registration[0].length;

      const remainder =
        text.slice(argumentStart);

      const literalArgument =
        remainder.match(
          /^\s*(["'])(\/[^"']+)\1/s,
        );

      if (literalArgument === null) {
        continue;
      }

      const normalized =
        normalizeRoutePath(
          literalArgument[2]!,
        );

      evidence.push({
        method,
        path: normalized,
        key: `${method} ${normalized}`,
        file: relative(file),
        strength: "strong",
      });
    }

    for (
      const match of text.matchAll(
        routeLiteralPattern,
      )
    ) {
      const normalized =
        normalizeRoutePath(
          match[1]!,
        );

      if (negativePaths.has(normalized)) {
        continue;
      }

      evidence.push({
        path: normalized,
        file: relative(file),
        strength: "path-only",
      });
    }
  }

  const unique = new Map<string, RuntimeEvidence>();

  for (const item of evidence) {
    const discriminator =
      item.strength === "strong"
        ? `${item.strength}|${item.key}|${item.file}`
        : `${item.strength}|${item.path}|${item.file}`;

    unique.set(discriminator, item);
  }

  return {
    evidence: [...unique.values()].sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        (a.method ?? "").localeCompare(
          b.method ?? "",
        ) ||
        a.file.localeCompare(b.file),
    ),
    unsupported: [...unsupported].sort(),
  };
}

function main(): void {
  const options = parseArgs(process.argv);

  const findings: Finding[] = [];

  if (!fs.existsSync(contractPath)) {
    findings.push({
      severity: "FAIL",
      code: "contract_missing",
      message:
        "canonical OpenAPI contract does not exist",
    });

    emit(findings);
    process.exit(1);
  }

  if (!fs.existsSync(routesRoot)) {
    findings.push({
      severity: "FAIL",
      code: "routes_missing",
      message:
        "runtime route directory does not exist",
    });

    emit(findings);
    process.exit(1);
  }

  const bytes = fs.readFileSync(
    contractPath,
  );

  const text = bytes.toString("utf8");

  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;

  if (hasBom) {
    findings.push({
      severity: "FAIL",
      code: "utf8_bom",
      message:
        "canonical OpenAPI contains a UTF-8 BOM",
    });
  } else {
    findings.push({
      severity: "PASS",
      code: "utf8_no_bom",
      message:
        "canonical OpenAPI is UTF-8 without BOM",
    });
  }

  if (
    bytes.length > 0 &&
    bytes[bytes.length - 1] === 0x0a
  ) {
    findings.push({
      severity: "PASS",
      code: "terminal_newline",
      message:
        "canonical OpenAPI has terminal newline",
    });
  } else {
    findings.push({
      severity: "FAIL",
      code: "terminal_newline",
      message:
        "canonical OpenAPI lacks terminal newline",
    });
  }

  const identityChecks = [
    [
      "openapi_identity",
      "openapi: 3.0.3",
      "OpenAPI version is 3.0.3",
    ],
    [
      "title_identity",
      "title: AutomationPlatform API",
      "API title is AutomationPlatform API",
    ],
    [
      "contract_version",
      "version: 0.6.0",
      "canonical contract version is 0.6.0",
    ],
  ] as const;

  for (
    const [
      code,
      marker,
      message,
    ] of identityChecks
  ) {
    findings.push({
      severity:
        text.includes(marker)
          ? "PASS"
          : "FAIL",
      code,
      message,
    });
  }

  const openapi = extractOpenApi(text);

  const uniqueOperationIds =
    new Set(
      openapi.operationIds,
    );

  findings.push({
    severity:
      uniqueOperationIds.size ===
      openapi.operationIds.length
        ? "PASS"
        : "FAIL",
    code: "operation_id_unique",
    message:
      `operationIds unique (${uniqueOperationIds.size}/${openapi.operationIds.length})`,
  });

  findings.push({
    severity:
      openapi.paths.length > 0 &&
      openapi.operations.length > 0
        ? "PASS"
        : "FAIL",
    code: "openapi_topology",
    message:
      `OpenAPI topology: ${openapi.paths.length} paths / ${openapi.operations.length} operations`,
  });

  const files = walkTsFiles(
    routesRoot,
  );

  const runtime = inspectRuntime(
    files,
  );

  const strongKeys = new Set(
    runtime.evidence
      .filter(
        (item) =>
          item.strength === "strong",
      )
      .map(
        (item) => item.key!,
      ),
  );

  const allRuntimePaths = new Set(
    runtime.evidence.map(
      (item) => item.path,
    ),
  );

  const openApiKeys = new Set(
    openapi.operations.map(
      (item) => item.key,
    ),
  );

  const openApiPaths = new Set(
    openapi.paths,
  );

  const strongRuntimeOnly = [
    ...strongKeys,
  ]
    .filter(
      (key) => !openApiKeys.has(key),
    )
    .sort();

  for (const key of strongRuntimeOnly) {
    findings.push({
      severity: "FAIL",
      code: "runtime_operation_undocumented",
      message:
        `undocumented strong runtime operation: ${key}`,
    });
  }

  const runtimeOnlyPaths = [
    ...allRuntimePaths,
  ]
    .filter(
      (candidate) =>
        !openApiPaths.has(candidate),
    )
    .sort();

  for (const candidate of runtimeOnlyPaths) {
    findings.push({
      severity: "FAIL",
      code: "runtime_path_undocumented",
      message:
        `undocumented runtime path evidence: ${candidate}`,
    });
  }

  const openApiWithoutRuntimePath = [
    ...openApiPaths,
  ]
    .filter(
      (candidate) =>
        !allRuntimePaths.has(candidate),
    )
    .sort();

  for (
    const candidate of
    openApiWithoutRuntimePath
  ) {
    findings.push({
      severity: "FAIL",
      code: "openapi_path_without_runtime",
      message:
        `OpenAPI path lacks runtime route evidence: ${candidate}`,
    });
  }

  const openApiNotStrong = openapi.operations
    .map(
      (item) => item.key,
    )
    .filter(
      (key) =>
        !strongKeys.has(key),
    )
    .sort();

  for (const key of openApiNotStrong) {
    const operation =
      openapi.operations.find(
        (item) => item.key === key,
      )!;

    if (
      allRuntimePaths.has(
        operation.path,
      )
    ) {
      findings.push({
        severity: "REVIEW",
        code: "method_evidence_path_only",
        message:
          `path-only runtime evidence for OpenAPI operation: ${key}`,
      });
    }
  }

  for (
    const item of runtime.unsupported
  ) {
    findings.push({
      severity: "REVIEW",
      code: "unsupported_route_syntax",
      message: item,
    });
  }

  for (const negative of negativePaths) {
    const existsInOpenApi =
      openApiPaths.has(negative);

    const existsInRuntime =
      allRuntimePaths.has(negative);

    findings.push({
      severity:
        !existsInOpenApi &&
        !existsInRuntime
          ? "PASS"
          : "FAIL",
      code: "negative_route_exclusion",
      message:
        `negative route excluded: ${negative}`,
    });
  }

  if (options.mode === "frozen") {
    const actual =
      sha256(
        readGitIndexBytes(
          "api-contracts/automation-platform-scheduler-admission.openapi.yaml",
        ),
      );

    findings.push({
      severity:
        actual === options.sha256
          ? "PASS"
          : "FAIL",
      code: "frozen_sha256",
      message:
        `frozen SHA-256 ${actual}`,
    });
  }

  emit(findings);

  const hasFail =
    findings.some(
      (item) =>
        item.severity === "FAIL",
    );

  const hasReview =
    findings.some(
      (item) =>
        item.severity === "REVIEW",
    );

  if (hasFail || hasReview) {
    process.exit(1);
  }

  process.exit(0);
}

function emit(
  findings: Finding[],
): void {
  const order: Record<Severity, number> = {
    FAIL: 0,
    REVIEW: 1,
    PASS: 2,
  };

  const sorted = [...findings].sort(
    (a, b) =>
      order[a.severity] -
        order[b.severity] ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );

  for (const finding of sorted) {
    console.log(
      `[${finding.severity}] ${finding.code}: ${finding.message}`,
    );
  }

  const fail =
    sorted.filter(
      (item) =>
        item.severity === "FAIL",
    ).length;

  const review =
    sorted.filter(
      (item) =>
        item.severity === "REVIEW",
    ).length;

  const pass =
    sorted.filter(
      (item) =>
        item.severity === "PASS",
    ).length;

  console.log("");
  console.log(
    `SUMMARY pass=${pass} review=${review} fail=${fail}`,
  );
}

main();
