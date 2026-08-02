# GitHub Actions AI Quality Gate

Status:  
Active CI foundation

Authority: [HelseApp AI Constitution](./00_AI_CONSTITUTION.md)  
Architecture: [AI OS v2.0 Architecture](./04_AI_OS_V2_ARCHITECTURE.md)  
Related: [Migration Roadmap](./05_AI_OS_V2_MIGRATION_ROADMAP.md), [Integration Harness](./08_AI_OS_V2_INTEGRATION_HARNESS.md)

## Purpose

The `AI Quality Gate` workflow independently verifies the AI OS v2 foundation on clean GitHub-hosted Linux infrastructure.

It installs dependencies from the lockfile, typechecks the TypeScript AI layer, runs the full AI test suite, and executes the dry-run integration harness. It does not deploy, call providers, or change production behavior.

Workflow file: `.github/workflows/ai-quality-gate.yml`

## Trigger policy

- every `pull_request`
- every `push` to `main` (default branch)
- manual `workflow_dispatch`
- concurrency group `ai-quality-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` so superseded runs are cancelled

## Commands

From the repository root:

1. `npm ci` — clean install from `package-lock.json`
2. `npm run typecheck` — `tsc --noEmit`
3. `npm run test:ai` — full AI foundation test suite
4. `npm run harness:ai` — dry-run AI OS v2 harness (no network)

Each verification command is a separate named step. Any failure fails the job (`continue-on-error` is not used).

## Security

- `permissions.contents: read` only
- no production secrets (`REPLICATE_*`, `TERRA_*`, Vercel, or other tokens)
- no provider or Terra network calls
- no artifact uploads (`actions/upload-artifact` forbidden)
- official GitHub Actions only: `actions/checkout`, `actions/setup-node` (pinned major versions)
- no deployment jobs or package publishing
- `CI: true` set for the job environment

## What it proves

- clean dependency installation via `npm ci`
- TypeScript correctness for the AI OS v2 layer
- AI foundation test success
- dry-run harness success
- Linux / Node 22 compatibility

## What it does not prove

- image quality
- Replicate availability
- production API behavior
- Vercel deployment correctness
- real provider latency
- result-validator quality

## Branch protection recommendation

Require the status check:

`AI Quality Gate / quality-gate`

before merging to `main`.

Do not change repository settings from this documentation or the workflow file; configure branch protection in GitHub Settings.

## Running locally

```
npm ci
npm run typecheck
npm run test:ai
npm run harness:ai
```

## Known limitations

- one Node version (22)
- no provider integration
- no production E2E
- no image fixtures
- no coverage threshold yet

## Permanent rule

> Code that fails the AI Quality Gate must not be merged into the protected
> production branch.
