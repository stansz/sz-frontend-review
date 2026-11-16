# Triage for modern-web findings

`legacy-scan` checks about 20% of the modern-web-guidance catalogue with deterministic rules.

For each `modern-web` finding, read `meta.keepWhen` and `meta.dropWhen` and the code at `file:line`; drop it when a `dropWhen` case applies (a deliberate fallback, vendor or generated code, a lookalike); keep it when a `keepWhen` case applies.

Kept findings go in the report under the rule id with the guide id. For a concrete fix, run `<skill-dir>/scripts/node_modules/.bin/modern-web-guidance retrieve <guideId>` (`<skill-dir>` is the folder holding SKILL.md) and summarise the guide's recommendation and fallback in the Fix column.

Guides assume Baseline Widely available features are safe; if the project states a browser support policy (in README, AGENTS.md, CLAUDE.md or browserslist), follow it.
