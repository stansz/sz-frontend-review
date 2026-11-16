# Visual critique and manual accessibility checks

## 1. First impression

Start from the 1280 screenshot: what draws the eye first, and should it? Is the purpose of the site clear in five seconds — what it sells, for whom, and the next step?

## 2. Usability

Can the main task be done from this page, are the actions obvious, and are there unnecessary steps, dead ends or choices the user should not have to make yet?

## 3. Visual hierarchy

Check the reading order, what each level of emphasis is doing, whether whitespace separates the right things, and whether the type scale steps cleanly instead of jumping.

## 4. Consistency

Compare spacing, colour and type across the page; similar elements should look alike and behave alike — same radii, same button heights, same icon style.

## 5. Responsive

Compare the 390, 768 and 1280 screenshots: does content reflow instead of being cut off, does anything disappear that should not, and are there cramped or empty areas at any width?

## 6. Accessibility checks tools cannot do (WCAG 2.2 AA)

- 2.1.1 keyboard: every action works from the keyboard; watch for click handlers on non-interactive elements without role and tabindex.
- 2.4.7 focus visible: a visible focus indicator on every focusable element.
- 2.4.11 focus not obscured: sticky headers must not hide the focused element.
- 2.5.7 dragging movements: anything dragged also has a single-pointer alternative.
- 2.5.8 target size minimum: interactive targets are at least 24x24 CSS px (44px is the AAA level 2.5.5: advisory only).
- 1.4.10 reflow: no two-dimensional scrolling at 320px.
- 3.2.6 consistent help: help (contact, chat, FAQ) appears in the same relative order on every page.
- 3.3.1 error identification: errors are stated in text, not just colour.
- 3.3.2 labels or instructions: every input has a visible label or instruction.
- 3.3.7 redundant entry: information already given is not asked for again in the same process.
- 3.3.8 accessible authentication: no cognitive function test without an alternative.

Automated checks find only part of accessibility problems; always list manual screen-reader testing under "Not checked".

## 7. What works well

Always name 2-3 specific strengths. Each feedback point says what, why, and a concrete alternative.
