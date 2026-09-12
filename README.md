# WardogsBuilder

Building design tool for the game Wardogs. A 2D grid editor on the left, a live
3D view of what you built on the right.

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
| `src/ui/` | Palette, toolbar and reporting panels |
| `src/styles/_tokens.scss` | Every colour and font in the tool, in one file |

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

Phases 0 and 1 are complete: the layout shell and the tested model core.
The 2D editor is phase 2 and the 3D view is phase 3. See `docs/PLAN.md`.

## Theme

`src/styles/_tokens.scss` is a placeholder palette. The Wardogs site could not
be reached from the development environment to sample the real brand colours and
fonts, so swapping them in is an edit to that one file.
