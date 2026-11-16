---
name: frontend-review
description: Review a frontend (local project, GitHub repo, or live URL) for AI-slop design tells, accessibility (axe-core, WCAG 2.2 AA), outdated web-platform patterns, and model-sounding copy, merged into one report. Review only, never edits code. Use for "review this site", "audit my frontend", "frontend review", "check for AI slop", "is this accessible", "design QA", "review the landing page". Modes: tools-only, quick, full.
argument-hint: "<path | github url | url> [tools-only|quick|full] [--url <dev server url>]"
allowed-tools: Bash(node {{SKILL_DIR}}/scripts/review.mjs:*), Bash(node {{SKILL_DIR}}/scripts/render-review.mjs:*), Bash(node {{SKILL_DIR}}/scripts/check-updates.mjs:*), Bash({{SKILL_DIR}}/scripts/node_modules/.bin/modern-web-guidance retrieve:*), Read, Grep, Glob
---
