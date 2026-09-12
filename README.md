# WardogsBuilder

Building design tool for the game Wardogs. Construct in a 3D view, with an
optional top-down plan overview alongside.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run dev:lan  # same, reachable from a phone on the same network
npm test         # model core unit tests
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle locally
```

## Hosting it

The tool is entirely static. There is no backend, no build step on the server
and no database: saves live in the browser and a shared build travels inside the
link. So hosting is copying a folder.

```bash
npm run build    # writes dist/
```

Upload the contents of `dist/` anywhere that serves files. Asset paths are
relative, so it works at the root of a domain, in a subdirectory of shared
hosting, or on a GitHub Pages project site, with no configuration.

### GitHub Pages

`.github/workflows/pages.yml` builds, runs the tests and publishes on every
push to `main` or the working branch.

Pages has to be switched on once, under **Settings → Pages → Build and
deployment → Source → GitHub Actions**. It cannot be done from the workflow:
creating the site through the API needs admin rights the workflow token does not
have. Once it is on, re-run the workflow from the Actions tab and the site
appears at `https://jugglingjon.github.io/WardogsBuilder/`.

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
| Every shortcut | `?` |

On a touch screen one finger orbits, two fingers pinch and pan, and a tap uses
the current tool.

Pieces land on the highest surface under their footprint, or on the ground.
Nothing floats, so there is no height control to think about.

## The plan overview

The Plan button opens a read-only top-down projection beside the 3D view, for
judging the whole site at once: where the perimeter runs and how far apart
things are. Pan, zoom and click to select. It never edits.

## Saving and sharing

The current build autosaves and comes back on reload. Builds opens a dialog for
named saves, import and export. Share packs the whole build into a link with no
account and no server behind it. Image saves the view as a PNG.

## Starting over

**Builds → New build** clears the current construction. It asks first when
anything is placed, because it also clears the undo stack.

Saved builds are deleted one at a time from the same dialog. Opening a share
link consumes it: the build is taken out of the address bar so a later reload
does not reopen it over your work.

Everything is stored per browser origin under `wardogs.*` keys, so a hosted copy
and a local one never see each other's saves.

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

All six phases are complete, and editing moved from the 2D grid into the 3D
view along the way. See `docs/PLAN.md`.

Known gap: marquee selection was dropped when the 2D editor was replaced, since
a grid rectangle stopped meaning anything in perspective. Multi-select is
shift-click; a screen-space marquee is the natural replacement.

## Theme

`src/styles/_tokens.scss` is a placeholder palette. The Wardogs site could not
be reached from the development environment to sample the real brand colours and
fonts, so swapping them in is an edit to that one file.
