# Einstein Tile Background — Design

**Date:** 2026-10-11
**Status:** Approved for implementation
**Scope:** `docs/index.html` background layer only

## Goal

Replace the existing 3.5rem background grid with a live, aperiodic Einstein tile
field that animates continuously, reacts to Pi's codemode state, and stays legible
behind body text.

Aperiodic means the pattern **never repeats** — every tile in view is unique. That
is the whole conceit, and it is what distinguishes this from the plain CSS grid it
replaces.

## Constraints

- **No third-party libraries.** The tiling is generated from scratch in vanilla JS
  on a `<canvas>`. This is a hard constraint.
- Single self-contained file. No build step. Served as static GitHub Pages.
- Must not regress text contrast, accessibility, or frame budget.

## Chosen direction

**"Compile"** — a diagonal light wipe sweeps the field continuously, brightening
tiles as it passes.

Chosen over two rejected alternatives:

| Direction | Verdict |
| --- | --- |
| **Compile** — diagonal wipe | **Chosen.** Perpetually in motion; dim enough to read text over; thematically rhymes with codemode (a program writing the tiling). |
| Weave — hairline outlines | Rejected. Reveals on load then goes static; not enough ambient life. |
| Quilt — filled palette tiles | Rejected. At any opacity that reads as "quilt", it drowns the headline and lede. |

## Architecture

### Placement

```html
<div class="bg" aria-hidden="true">
  <div class="bg__wash"></div>
  <canvas class="bg__tiles"></canvas>
  <div class="bg__spot" id="spot"></div>
</div>
```

`<canvas class="bg__tiles">` **replaces** `<div class="bg__grid"></div>`, slotted
between `.bg__wash` and `.bg__spot`. Both existing layers are untouched.

The tile field replaces the grid rather than layering with it: the tile field is
itself grid-derived, so keeping both means two competing structures and a muddier
read. One structural idea, not two.

The canvas sits inside the existing `aria-hidden="true"` `.bg`, so it is decorative
and contributes nothing to the accessibility tree.

### The tiling

Standard Katz–Steinhardt **hat** construction:

1. Split every unit square by the diagonal `(0,0) → (1,1)` into `T` (upper-left
   triangle) and `T'` (lower-right triangle).
2. A **hat** is two triangles joined across a horizontal cell edge:
   - `S(i,j) = T(i,j) ∪ T'(i,j+1)`
   - `S'(i,j) = T'(i,j) ∪ T(i,j-1)`
3. **The aperiodic constraint:** no two hats may share a grid vertex. Enforced
   during a single scan with a `Set` of packed vertex keys
   (`(y << 11) | (x & 2047)`).
4. Cells not claimed by a hat become plain triangles; orientation alternates on
   `(i+j)` parity.

The field wraps horizontally with period `cols`, and is generated with 2 cells of
bleed beyond the viewport on every side so no seam is ever visible.

### Determinism

Seeded `mulberry32` PRNG with a **fixed seed**. No `Math.random()`.

The pattern is byte-identical on every load and in both themes, so the page never
reshuffles under the reader. Reloading does not move the background.

### Rendering: geometry once, animation nearly free

The entire field compiles into a **single cached `Path2D`** — hats and triangles as
two sub-paths — built **only on resize**.

Each frame then performs exactly two draw calls:

```
ctx.fill(path)
ctx.stroke(path)
```

with a `createLinearGradient` whose stop offset advances over time.

There is no per-tile loop, no per-tile allocation, and no geometry rebuild at
60fps. Frame cost is independent of tile count. For a 1600×900 viewport at a 48px
cell this is roughly 630 tiles / ~1900 vertices, and it still costs two draw calls.

## Visual design

| Property | Value |
| --- | --- |
| Cell size | 48px, clamped to a sensible band on resize |
| Hat density | ~0.055 per cell |
| Wipe direction | Bottom-left → top-right |
| Wipe speed (codemode off) | ~0.32 cycles/sec |
| Wipe speed (codemode on) | ~2.2× the off speed |
| Wipe band width | ±0.22 of the gradient axis |
| Stroke peak alpha | Off: ~0.45 · On: ~0.70 |
| Fill peak alpha | Off: ~0.06 · On: ~0.12 |
| Floor alpha (both ends of wipe) | ~0.05 |

These are starting values, materially dimmer than the raw prototype (which peaked
at 0.85). They get tuned against real screenshots during implementation; the
requirement is that body text stays comfortably above 4.5:1 while the wipe is still
clearly visible.

### Colour

Drawn from CSS custom properties already present in the page, read once at init:

| Token | Use |
| --- | --- |
| `--accent` | Hat outlines (coral — the page's primary accent) |
| `--line-2` | Triangle outlines (the existing field/grid tone) |
| `--bg` | Tile fill base |

Both themes get correct colours for free because the theme script in `<head>` sets
`data-theme` before this runs.

### Text-column mask

**Included.** After stroking the field, a linear-gradient alpha ramp is composited
with `destination-out` to erase the tiles beneath the pitch (left) column, tapering
them to nothing. Only the ramp's alpha matters under `destination-out`; the
gradient's colour is irrelevant.

Geometry: from the inline-start edge of the viewport to roughly 46% of viewport
width, ramping from fully opaque (erase everything) at the edge to fully
transparent by the end — so the field fades back in across the terminal column.

Rationale: the existing page caps its pointer spotlight at 11% opacity specifically
so that `--fg-2` body text stays above 4.5:1. Quietly dropping tiles behind that
same text, unmasked, would undo that deliberate care.

The mask applies **only** when the two-column layout is active (≥ 60rem). On the
stacked mobile layout the pitch column spans the full width, so there is nothing to
protect and the field runs edge to edge.

## State reactivity

Rather than polling or attaching a `MutationObserver`, the existing `setStatus(on)`
function gains one line calling `setTilesActive(on)`.

When codemode is on: wipe speed ×2.2, peak opacity up. When off: slow and dim.

This is a single explicit seam — no coupling in the other direction, no per-frame
string comparison.

## Accessibility and degradation

Matches the patterns already in the page:

- **`prefers-reduced-motion: reduce`** — render exactly **one** static frame at the
  mid-gradient position, dimmed. No `requestAnimationFrame` is ever started. This
  mirrors the existing `staticTranscript()` path.
- **`document.hidden`** — `rAF` paused, resumed on visibility change.
- **DPR capped at 2**, matching the existing pointer spotlight.
- **No resize thrash** — geometry rebuilds are debounced to one per resize frame.
- Canvas is `aria-hidden` (via the parent `.bg`), purely decorative, and adds no
  focusable or announced content.

## Out of scope

Explicitly **not** touched by this work:

- The terminal demo and its replay logic
- The pointer spotlight (`.bg__spot`)
- The colour wash (`.bg__wash`)
- Any page copy, metadata, or structured data
- The dark/light theme mechanism itself

## Verification

Each item below must actually be executed and observed, not assumed.

1. **Tiling validity** — assert in-browser that every cell in the generated grid is
   covered exactly once, and that no two hats share a grid vertex.
2. **Visual check** — screenshot at several viewport sizes; confirm no seam at the
   horizontal wrap boundary and no tile legibility loss under the headline.
3. **Reduced motion** — emulate `prefers-reduced-motion: reduce` and confirm a
   single static frame renders with no animation loop.
4. **Contrast** — run a Lighthouse accessibility audit; confirm body-text contrast
   is unharmed relative to the pre-change page.
5. **Frame budget** — confirm the per-frame path issues exactly two draw calls and
   that a resize triggers exactly one geometry rebuild.
6. **Theme check** — confirm correct rendering in both dark and light themes.

## Risks

| Risk | Mitigation |
| --- | --- |
| Canvas paint cost on large displays | Two draw calls per frame from a cached `Path2D`; DPR capped at 2. |
| Mask hurting text contrast | Mask only reduces tile presence under text; verify with Lighthouse (item 4). |
| Horizontal seam at wrap boundary | 2-cell bleed plus the vertex-disjointness constraint; verify visually (item 2). |
| Reader distraction from constant motion | Dim peak opacity, reduced-motion static path, and the text-column mask. |