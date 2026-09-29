# Architecture: <feature>

Owner: architect-agent | Requirement revision: <id> | BA revision: <id>
Decision: features/<feature>/decision.json

## Gate check và scope
<BA status, conditions, unresolved items; không tự chốt business policy.>

## Components và dependency contracts
<Boundaries, stack rationale, read/prepare/execute isolation, module interfaces.>

## Domain / storage / ledger
<Entities, units/precision/rounding, immutable entry, provenance links, constraints, event uniqueness, migrations/recovery; AC/BR mappings.>

## API contracts và state machines
<Request/response/errors/auth; position, intent, order, reservation, repayment và reconciliation lifecycles; unknown vs failed; partial execution và restart. Không giả định exchange transaction atomic.>

## Financial formulas
<BA-approved formulas, worked examples, executable valuation, fee/interest double-count prevention.>

## Concurrency / idempotency
<Locks/reservations, race boundaries, persist-before-submit, duplicate handling, external IDs đã verify, unknown-outcome reconciliation.>

## User confirmation / modes / security / audit
<Server enforcement, preview expiry/material changes, action-specific authorization, credential storage/redaction, audit correlation, environment isolation.>

## UI handoff
<Explainable score, timestamps, liabilities, risk status, proceeds reservation, confirmation, errors và recovery.>

## Validation và rollout
<AC→component→test plan, safe fixtures, operational observability, feature dependencies, rollback; LIVE activation không implicit.>

## Open decisions và readiness
<Blockers, conditions, rationale architecture READY; revision references.>
