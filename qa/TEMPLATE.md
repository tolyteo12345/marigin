# QA report: <feature>

Owner: qa-agent | Implementation revision/digest: <id>
Requirement / architecture revisions: <ids> | Review approval: <reference>
Environment/mode: <mock/paper/verified safe environment> | Run time: <UTC>
Status: <PASS | PASS_WITH_WARNINGS | FAIL — chỉ chọn sau thực thi>

## Coverage
| AC / rule | Test case | Input + units | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| <id> | <case> | <data> | <value> | <observed> | <command/log/artifact> | <PASS/FAIL/NOT_RUN> |

## Required suites
<Calculation/rounding, cap and 2× boundaries, confirmation absence/expiry/replay, READ_ONLY/PAPER/LIVE isolation, source mixing, reserved proceeds, partial fills/repay, stale data, timeouts, duplicates, races, reconciliation and crash recovery. N/A cần rationale.>

## Defects / warnings
<ID, severity, steps, expected/actual, affected AC, owner, evidence, fix revision, retest result. Warning acceptance bởi user/product owner, không waive financial/security correctness.>

## Verdict
<Executed vs not run, residual risks, blockers, proposed qa_status. NOT_RUN required case không được PASS. QA FAIL → development → independent review → QA lại.>
