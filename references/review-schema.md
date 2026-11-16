# review.json

The agent writes `<out>/review.json` after triage; `scripts/render-review.mjs <out>` turns it plus `findings.json` into `review.html` (self-contained, screenshots embedded) and `review.md`. Text fields may use `` `code` `` and `**bold**`.

```json
{
  "title": "Site or project name",
  "url": "https://example.com",
  "target": "project-folder-name",
  "commit": "abc1234",
  "mode": "full",
  "date": "YYYY-MM-DD",
  "summary": "Two or three sentences: the overall verdict and the most important fixes.",
  "toolFindings": 21,
  "merged": "11 duplicate reports merged into 2 findings",
  "added": 3,
  "findings": [
    {
      "severity": "critical",
      "source": "axe",
      "rule": "label-content-name-mismatch",
      "title": "Short plain-language headline",
      "standard": "WCAG 2.5.3 Label in Name (A)",
      "viewport": "768px",
      "merged": 3,
      "location": "path/file.ext:line, other/file.ext:line",
      "issue": "What is wrong and who it affects.",
      "fix": "The concrete change."
    }
  ],
  "dropped": [
    { "rule": "dark-glow", "source": "impeccable", "count": 2, "reason": "Why it is a false positive here." }
  ],
  "worksWell": ["Specific strength."],
  "score": {
    "total": 8,
    "parts": [
      { "name": "Colour palette", "score": 2, "max": 3, "note": "Why." },
      { "name": "Typography", "score": 2, "max": 3, "note": "Why." },
      { "name": "Layout variety", "score": 2, "max": 2, "note": "Why." },
      { "name": "Copy authenticity", "score": 2, "max": 2, "note": "Why." }
    ]
  },
  "notChecked": ["Anything not covered."]
}
```

- Required: `findings` (may be empty). Everything else is optional; leave out what does not apply.
- `severity` is `critical`, `warning` or `advisory` (tool `error` becomes `critical`).
- `source` is the tool name from `findings.json` (`impeccable`, `impeccable-url`, `axe`, `browser`, `modern-web`, `copy-lint`) or `judgement` or `visual`.
- `viewport` links the finding to the screenshot at that width.
- `merged` is how many tool reports the finding combines; `title` is a headline for a person, not the rule id.
- Don't put private details (tokens, internal hostnames, personal data) in any field: the page may be published.
