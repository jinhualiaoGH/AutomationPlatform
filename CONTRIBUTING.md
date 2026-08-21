# Contributing to Automation Platform

Thank you for contributing to Automation Platform.

## Development Environment

The supported development baseline is Node.js 24.

Install the repository dependencies from the committed lockfile:

```powershell
npm ci
```

Create local environment configuration from `.env.example`. Never commit a
real `.env` file or live credentials.

Database-backed development requires an appropriate SQL Server environment
and the native/ODBC prerequisites required by the configured database
driver.

## Canonical Verification

Before submitting a change, run:

```powershell
npm run ci
```

The canonical CI command composes repository typechecking, tests, current
OpenAPI governance verification, and the TypeScript build.

Individual validation commands remain available when diagnosing failures:

```powershell
npm run typecheck
npm test
npm run openapi:check
npm run openapi:check:frozen
npm run build
```

## Tests

Behavioral changes should include or update tests appropriate to the
affected behavior.

Do not weaken existing tests merely to make a change pass.

## OpenAPI Governance

Runtime HTTP-route changes must remain synchronized with the canonical
OpenAPI contract.

Run the current contract-governance check before submitting route or API
changes:

```powershell
npm run openapi:check
```

The frozen contract command verifies the certified release fingerprint and
should not be changed casually:

```powershell
npm run openapi:check:frozen
```

## Database Migrations

Schema changes should be represented through the repository's migration
mechanism rather than undocumented manual database changes.

Migration changes should preserve deterministic ordering and should be
reviewed together with the runtime behavior that depends on them.

## Pull Requests

Keep pull requests focused and reviewable.

A pull request should:

- describe the purpose of the change;
- identify important behavioral or contract effects;
- include appropriate tests;
- pass `npm run ci`;
- avoid unrelated formatting or refactoring churn; and
- avoid committing generated, temporary, or local-only artifacts.

## Credentials and Sensitive Information

Never commit:

- `.env`;
- passwords;
- database credentials;
- access tokens;
- private keys;
- production connection strings; or
- other secrets.

Use `.env.example` only for variable names and safe example or placeholder
values.

## Commit Hygiene

Do not commit local debugging helpers, temporary patch scripts, build
outputs, dependency directories, or machine-specific files unless they are
an intentional part of the repository.
