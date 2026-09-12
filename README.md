# WardogsBuilder

Building design tool for the game Wardogs. Construct in a 3D view, with an
optional top-down plan overview alongside.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # model core unit tests
npm run build    # production bundle into dist/
```

## Where things are

| Path | What it holds |
| --- | --- |
| `docs/PLAN.md` | Architecture, rules, delivery phases, open questions |
| `data/elements.json` | The element catalog. Sizes, costs and rules live here, not in code |
| `src/model/` | The tested core: grid maths, occupancy, validation, undo |
| `src/three/` | The scene, the placement ghost, and the editor |
| `src/editor/` | The read-only plan overview |
| `src/ui/` | Palette, toolbar and reporting panels |
| `src/styles/_tokens.scss` | Every colour and font in the tool, in one file |

## Building

Everything is built in the 3D view. Point at the site and a ghost shows exactly
where the piece lands, red when it cannot go there, with the reason named in the
status bar.

| Action | How |
| --- | --- |
| Place | Pick an element, click, or drag to paint a run |
| Select | `V`, then click. Shift-click to add |
| Move | Drag a selection. It commits on release, as one undo step |
| Erase | `E`, then click or drag |
| Rotate | `R`, on the pending piece or the selection |
| Delete | `Delete` on a selection |
| Copy, paste, duplicate | `Ctrl+C`, `Ctrl+V`, `Ctrl+D` |
| Undo, redo | `Ctrl+Z`, `Ctrl+Shift+Z` |
| Orbit | Right-drag |
| Pan | Middle-drag |
| Zoom | Scroll |
| Frame the build | The Frame button, or the Top, Front and Corner presets |
| Section cut | Clip, then move the height with the stepper or `PageUp` and `PageDown` |

Pieces land on the highest surface under their footprint, or on the ground.
Nothing floats, so there is no height control to think about.

## The plan overview

The Plan button opens a read-only top-down projection beside the 3D view, for
judging the whole site at once: where the perimeter runs and how far apart
things are. Pan, zoom and click to select. It never edits.

## The rules it enforces

- One cell is one cubic metre. Every element is a whole-cell box of
  width × depth × height.
- Every cell of a piece's base must rest on the ground or on a supporting
  element. No overhangs, no floating.
- Only Hesco blocks and the Bunker can support. Nothing stacks on a FOB or an
  Air Defense.
- Exactly one FOB, which defines the buildable region: its footprint plus 50 m
  in every direction, a 103 × 103 m square.
- Nothing may pass the 16 m build ceiling.

## Status

Phases 0 to 4 are complete, and editing has since moved from the 2D grid into
the 3D view. Phase 5 adds saving and sharing. See `docs/PLAN.md`.

Known gap: marquee selection was dropped when the 2D editor was replaced.
Multi-select is shift-click for now.

## Theme

`src/styles/_tokens.scss` is a placeholder palette. The Wardogs site could not
be reached from the development environment to sample the real brand colours and
fonts, so swapping them in is an edit to that one file.
