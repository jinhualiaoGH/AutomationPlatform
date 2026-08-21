# Automation Platform

A durable SQL-backed automation and scheduling platform with REST APIs,
scheduler execution, recovery coordination, generation continuity,
cross-process ownership, lease renewal, and fencing-token protection.

---

# Quick Start - How to Run the Platform

This section is intentionally first. It provides the normal operator path
for configuring, migrating, building, starting, verifying, and stopping
the Automation Platform.

## 1. Prerequisites

The platform requires:

- Node.js and npm
- Microsoft SQL Server
- Network access from the application host to SQL Server
- A database and SQL identity with the permissions required by migrations
- Application environment configuration

Install dependencies:

```powershell
cd C:\AutomationPlatform
npm install

```powershell
cd C:\AutomationPlatform
npm install
```

## 2. Configure the Environment

Create the local environment file from the supplied example:

```powershell
cd C:\AutomationPlatform
Copy-Item .env.example .env
```

Review `.env` and configure the SQL Server connection and other
environment-specific settings before starting the platform.

Do not commit secrets from `.env` to source control.

## 3. Run Database Migrations

Apply the database schema migrations:

```powershell
npm run migrate
```

Migrations are designed to be safely rerunnable. A successful migration
run should finish without errors.

## 4. Typecheck and Test

Run the automated test suite:

```powershell
npm test
```

The test suite validates the platform's application, scheduling,
recovery, ownership, lease-renewal, fencing, and lifecycle behavior.

## 5. Build the Platform

Create the production JavaScript build:

```powershell
npm run build
```

The compiled application is written to the `dist` directory.

## 6. Start the Platform

Start the production application using the project's configured
production start command:

```powershell
npm start
```

The server initializes the application lifecycle, database connectivity,
and production scheduler runtime.

Only the process that successfully acquires durable scheduler ownership
is permitted to execute scheduler work.

## 7. Verify Health

After startup, verify that the HTTP health endpoint responds successfully.

For example, using PowerShell:

```powershell
Invoke-WebRequest http://127.0.0.1:31080/health
```

A healthy running instance should return a successful HTTP response.

The effective port is determined by the application's configured
environment.

## 8. Stop the Platform

For an interactively running instance, use:

```text
Ctrl+C
```

The application lifecycle performs shutdown processing before the
process exits.

Production process supervisors should use their normal graceful
termination mechanism.

## 9. Normal Operator Run Sequence

For a normal deployment or local production-validation cycle:

```powershell
cd C:\AutomationPlatform

npm install
npm run migrate
npm test
npm run build
npm start
```

In another PowerShell terminal, verify health:

```powershell
Invoke-WebRequest http://127.0.0.1:31080/health
```

When testing is complete, gracefully stop the running application.

---

# Automation Platform Overview

Automation Platform is a durable SQL-backed automation and scheduling
system designed around explicit application lifecycle management,
persistent scheduler state, recovery coordination, and safe
cross-process scheduler ownership.

The platform provides:

- REST API and application-server integration
- SQL Server-backed durable state
- Scheduled automation execution
- Application lifecycle-controlled scheduler startup and shutdown
- Durable scheduler generation continuity
- Recovery supervision and restart coordination
- Cross-process scheduler ownership
- Renewable ownership leases
- Fencing-token protection against stale owners
- Fail-closed behavior when scheduler authority is lost
- Health and operational observability

The production architecture is designed so that multiple application
processes may exist while only the process holding valid scheduler
ownership is authorized to dispatch scheduled work.

# Production Ownership and Fencing

Scheduler ownership is persisted in SQL Server.

A production scheduler process must acquire a valid ownership lease
before scheduler execution becomes operational. Ownership includes a
generation/fencing identity used to distinguish the current authorized
owner from stale processes.

The active owner periodically renews its lease.

If ownership is lost, becomes stale, or cannot be safely verified, the
scheduler fails closed rather than continuing to dispatch work without
authority.

After lease expiry, another eligible process may acquire ownership and
continue scheduler operation using the advanced fencing identity.

This mechanism provides protection against duplicate scheduler
execution across competing application processes.

# Recovery and Continuity

The platform includes durable recovery coordination so scheduler state
is not dependent solely on the lifetime of one application process.

Recovery components coordinate scheduler generation continuity,
restart behavior, durable ownership, lease renewal, and fencing.

The resulting runtime model separates:

- application process lifetime
- durable scheduler state
- scheduler ownership authority
- scheduler generation identity
- recovery coordination

This allows scheduler operation to recover safely after process failure
while preventing stale processes from regaining authority
inappropriately.

# Repository Structure

Major repository areas include:

```text
database/
    migrations/

src/
    database/
    operations/
    recovery/
    repositories/
    server.ts

tests/

.env.example
package.json
tsconfig.json
vitest.config.ts
README.md
```

`database/migrations` contains persistent SQL schema evolution.

`src/recovery` contains durable scheduler recovery, ownership,
lease-renewal, fencing, and runtime-composition components.

`src/repositories` contains SQL-backed persistence abstractions.

`src/operations` composes operational application services.

`src/server.ts` is the production application integration point.

`tests` contains regression and phase-specific acceptance coverage.

# Development Validation

Before accepting a change, run:

```powershell
npm test
npm run build
npm run migrate
npm run migrate
```

Running migrations twice verifies migration idempotency in addition to
the normal build and regression checks.

# Operational Safety Principles

The platform follows several production-safety principles:

1. Durable scheduler state must survive application-process restart.
2. Scheduler authority must be explicit.
3. Only a valid owner may dispatch scheduler work.
4. Ownership leases must be renewable and time bounded.
5. Fencing identities must advance when ownership changes.
6. A stale process must not regain authority using an old identity.
7. Loss of ownership must fail closed.
8. Recovery must preserve scheduler generation continuity.
9. Database migrations must remain safely rerunnable.
10. Production lifecycle wiring must remain explicit and testable.

# Phase Evolution

The platform has evolved incrementally through production-oriented
architecture phases covering:

- SQL Server integration
- Database migration infrastructure
- Automation domain and REST APIs
- Execution runtime
- Scheduling runtime
- Read-only operational services
- Durable scheduler control
- Recovery supervision
- Scheduler generation continuity
- Cross-process durable recovery coordination
- Production scheduler ownership, lease renewal, and fencing

Each accepted phase is protected by regression tests and repository
freeze points before subsequent architecture changes are introduced.

# Current Release Status

The current implementation includes durable SQL-backed scheduler
ownership, renewable leases, fencing-token advancement, ownership-gated
production activation, recovery coordination, and fail-closed stale-owner
protection.

The README serves as the primary entry point for operators and
developers. The Quick Start section is intentionally placed at the top
so a new operator can determine how to configure, migrate, validate,
build, start, verify, and stop the platform before reading the detailed
architecture description.

# Architecture

Automation Platform is organized around explicit runtime, persistence,
scheduler, recovery, operational-control, and API-contract boundaries.

The repository structure and phase history document the evolution of these
components while preserving independently testable contracts.

# API and OpenAPI

The canonical OpenAPI description is:

`api-contracts/automation-platform-scheduler-admission.openapi.yaml`

The repository includes automated OpenAPI governance that compares the
runtime route surface with the canonical contract and verifies important
release invariants.

Run:

```powershell
npm run openapi:check
```

The certified frozen contract fingerprint can be checked separately with:

```powershell
npm run openapi:check:frozen
```

# Testing and Validation

The canonical repository verification command is:

```powershell
npm run ci
```

This composes typechecking, the automated test suite, current OpenAPI
governance, and the TypeScript build.

For focused validation, the repository also exposes:

```powershell
npm run typecheck
npm test
npm run openapi:check
npm run build
```

# Security

Do not commit live credentials, `.env` files, passwords, tokens, private
keys, or production connection strings.

Use `.env.example` as the configuration template.

See `SECURITY.md` for vulnerability-reporting guidance.

# License

Automation Platform is licensed under the ISC License.

See `LICENSE` for the complete license text.
