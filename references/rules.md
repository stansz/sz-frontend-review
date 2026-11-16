# Judgement rules

These are the rules no tool checks; tool rules are listed in `impeccable-rules.txt`, axe-core, modern-web-guidance and copy-lint, so do not repeat them here.

## Layout

### identical-card-grids

**Severity:** advisory
**Look for:** 3+ cards with the same icon + heading + text structure, repeated.
**Fix:** Vary the cards: change the layout for the most important one, merge the near-duplicates, or replace them with a single example that carries real content.

### section-monotony

**Severity:** advisory
**Look for:** every section uses the same centred heading + grid layout.
**Fix:** Alternate section layouts — split the grid, move the heading off-centre, use a full-width band — so the page has rhythm instead of one repeated block.

### template-hero

**Severity:** advisory
**Look for:** centred headline, subline and two buttons over a gradient or mesh with no product shown.
**Fix:** Put the product in the hero: a real screenshot, a live component, or concrete copy that says what the product does, with one primary action.

### decoration-instead-of-content

**Severity:** warning
**Look for:** abstract shapes or stock 3D where real product UI or photographs would explain the product.
**Fix:** Replace the decoration with the thing itself — a screenshot of the feature, a photo of the real subject, or a short demo — so the visual answers a question the visitor actually has.

## Type and colour

### type-pairing

**Severity:** advisory
**Look for:** more than two display families, or one default family with no hierarchy.
**Fix:** Pick at most two families with clear jobs (display + text) and build hierarchy from weight and size rather than adding another face.

### palette-intent

**Severity:** advisory
**Look for:** palette unrelated to brand or subject, one accent used for everything.
**Fix:** Derive the palette from the brand or the subject, and reserve the accent colour for the single most important action instead of spreading it over everything.

## Design system

### mixed-icon-sets

**Severity:** advisory
**Look for:** icons from two or more sets, mismatched stroke and style.
**Fix:** Use one icon set with a consistent stroke weight and corner style across the page; redraw or replace the outliers.

### inconsistent-components

**Severity:** warning
**Look for:** the same component styled differently, for example button radii or input heights.
**Fix:** Extract one shared style per component (radius, height, padding, states) and apply it everywhere the component appears.

## Copy

### vague-value-prop

**Severity:** warning
**Look for:** the first screen does not say plainly what is sold or what it does.
**Fix:** Rewrite the headline to name the product, the buyer and the outcome in one concrete sentence a stranger can act on.

### invented-proof

**Severity:** warning
**Look for:** made-up stats, logos or testimonials with placeholder names.
**Fix:** Remove anything you cannot source, and replace it with verifiable evidence — real customer names, measured numbers, or a link to the case study.

### placeholder-content

**Severity:** error
**Look for:** lorem ipsum, TODO, "Your Company", example.com links on a shipped page.
**Fix:** Replace every placeholder with real content before launch; if the content does not exist yet, remove the block instead of shipping filler.

## States and interaction

### missing-states

**Severity:** warning
**Look for:** no empty, loading or error state for data views; forms without error messages.
**Fix:** Design and implement the empty, loading and error states for every data view, and give each form field an inline error message.

### focus-removed

**Severity:** error
**Look for:** `outline: none` or `outline: 0` without a `:focus-visible` replacement.
**Fix:** Restore a visible focus indicator with `:focus-visible` (a ring with enough contrast against its background) instead of removing the outline.

### reduced-motion-missing

**Severity:** warning
**Look for:** animations or transitions without a `prefers-reduced-motion` alternative.
**Fix:** Wrap motion in `@media (prefers-reduced-motion: no-preference)` or provide a reduced path that swaps or fades instead of moving.

## AI-slop score

Score the design 0-10 from four parts: colour palette originality 0-3, typography distinctiveness 0-3, layout variety 0-2, copy authenticity 0-2. 10 = clearly designed by people for this product, 0 = an unedited AI template.
