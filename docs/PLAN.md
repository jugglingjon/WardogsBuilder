# WardogsBuilder — Development Plan

A browser-based planning tool for designing constructions in the game Wardogs.
Two panes: a 2D grid editor on the left, a live 3D preview on the right.

---

## 1. Goals and scope

**In scope for v1**

- Pick a building element from a palette and place it on a 2D grid.
- Move placed elements by dragging, rotate them, and delete them.
- See a live, low-fidelity 3D representation of the build in the right pane.
- Orbit, zoom and pan the 3D camera around the build.
- Multiple floors/levels, edited one level at a time in 2D, shown stacked in 3D.
- Save, load, export and share a design.

**Out of scope for v1**

- Accurate in-game art assets. The 3D view uses procedural primitives that read
  as walls, floors, ramps and pillars, not game models.
- Simulation of game rules (structural integrity, damage, resource cost) beyond
  a simple parts tally.
- Multi-user editing.

**Working assumption to confirm:** I do not have a verified list of Wardogs
building parts, their footprints or their snap behaviour. The element catalog is
therefore built as external data that can be edited without touching code, and
seeded with a generic set (floor, wall, half-wall, doorway, window, ramp,
stairs, pillar, roof, corner). Replacing that seed with the real parts list is a
data task, not a rewrite. See section 10.

---

## 2. Stack

Chosen to match a front-end workflow of HTML, SCSS and vanilla JS modules.

| Concern | Choice | Why |
| --- | --- | --- |
| Build/dev server | Vite | Fast HMR, native ES modules, compiles SCSS with no extra config |
| Language | Vanilla ES modules | No framework needed; the app is one screen with two custom renderers |
| Styles | SCSS, one partial per component | Matches existing workflow |
| 2D editor | HTML5 Canvas 2D | Hundreds of cells redrawn per frame; DOM nodes would not keep up |
| 3D view | three.js + OrbitControls | The standard for this, and OrbitControls gives orbit/zoom/pan for free |
| Tests | Vitest for model logic, Playwright for a smoke test | The grid/occupancy logic is where bugs hide and is pure functions |
| Backend | None in v1 | Static hosting. An optional PHP endpoint is discussed in section 8 |

No framework, no state library. The app has a single model object and two
renderers that subscribe to it.

---

## 3. Architecture

One source of truth, two views. The 2D pane is the only editor; the 3D pane is a
read-only subscriber that also supports click-to-select.

```
                 +---------------------+
   input  -->    |   EditorController  |
 (mouse/keys)    |  tools, selection   |
                 +----------+----------+
                            | commands
                            v
                 +---------------------+
                 |     BuildModel      |  <-- single source of truth
                 |  pieces, grid, undo |
                 +----+-----------+----+
                      | change    | change
                      v           v
             +----------------+  +------------------+
             |  GridRenderer  |  |  SceneRenderer   |
             |   (canvas 2D)  |  |   (three.js)     |
             +----------------+  +------------------+
```

- The model emits granular change events (`piece:add`, `piece:remove`,
  `piece:update`, `selection:change`, `level:change`).
- The 3D renderer keeps a `Map<pieceId, THREE.Object3D>` and applies deltas. It
  never rebuilds the whole scene on an edit, which keeps drag operations smooth.
- Every mutation goes through a command object so undo/redo is uniform.

### Directory layout

```
/
├── index.html
├── package.json
├── vite.config.js
├── docs/
│   └── PLAN.md
├── data/
│   └── elements.json          # the building element catalog
├── src/
│   ├── main.js                # bootstrap, wires everything together
│   ├── model/
│   │   ├── build.js           # BuildModel: pieces, levels, events
│   │   ├── catalog.js         # loads + indexes elements.json
│   │   ├── occupancy.js       # spatial index, collision tests
│   │   ├── commands.js        # AddPiece, MovePiece, RotatePiece, DeletePieces
│   │   ├── history.js         # undo/redo stack
│   │   └── serialize.js       # save/load/export, schema versioning
│   ├── editor/
│   │   ├── grid-renderer.js   # draws grid, pieces, ghosts, selection
│   │   ├── camera2d.js        # pan/zoom, screen <-> grid transforms
│   │   ├── controller.js      # pointer/keyboard handling, tool dispatch
│   │   └── tools/             # select.js, place.js, move.js, erase.js, area.js
│   ├── three/
│   │   ├── scene.js           # renderer, lights, ground, grid helper
│   │   ├── mesh-factory.js    # element recipe -> THREE geometry, cached
│   │   ├── sync.js            # model events -> scene graph deltas
│   │   └── picking.js         # raycast select, hover highlight
│   ├── ui/
│   │   ├── palette.js         # categorised, searchable element list
│   │   ├── toolbar.js         # tools, level selector, undo/redo
│   │   ├── inspector.js       # selected piece properties
│   │   └── shortcuts.js
│   └── styles/
│       ├── main.scss
│       └── _palette.scss, _layout.scss, _toolbar.scss, ...
└── tests/
```

---

## 4. Data model

### The build

```js
{
  schema: 1,
  name: "Forward Outpost",
  grid: { width: 48, depth: 48, levels: 6, cellSize: 1 },  // cellSize in metres
  pieces: [
    { id: "p1", type: "wall_basic", x: 12, y: 7, level: 0, rot: 90, anchor: "edge_n" }
  ]
}
```

- `x`/`y` are integer grid coordinates, `level` is an integer floor index.
- `rot` is one of 0/90/180/270. Arbitrary angles are deliberately excluded; the
  game is grid-based and free rotation would break snapping.
- `id` is a short unique string so the 3D renderer can track objects across edits.

### The element catalog (`data/elements.json`)

Every building element is data. Adding a new part means adding an entry, not
writing code.

```json
{
  "id": "wall_basic",
  "name": "Wall",
  "category": "structure",
  "anchor": "edge",
  "footprint": [[0, 0]],
  "height": 1,
  "color": "#8a8f98",
  "icon": "wall",
  "mesh": [
    { "shape": "box", "size": [1, 1, 0.12], "at": [0, 0.5, 0] }
  ],
  "tags": ["blocks-movement"]
}
```

- **`anchor`** is the key modelling decision. Floors and foundations occupy a
  *cell*; walls and railings sit on a cell *edge*; pillars sit on a *corner*.
  Treating all three as "things in a cell" would make wall placement feel wrong,
  so the occupancy index keys on anchor kind as well as coordinate.
- **`footprint`** lists the cell offsets a multi-cell part covers, rotated with
  the piece.
- **`mesh`** is a recipe of primitives (`box`, `wedge`, `cylinder`, `stairs`)
  combined into one group. A doorway is a wall built from three boxes around a
  gap, which avoids needing CSG or imported models.

### Occupancy index

A `Map` keyed by `` `${level}:${x}:${y}:${anchorSlot}` ``. Used for:

- rejecting overlapping placements (or replacing, for same-slot parts),
- fast hit-testing under the cursor,
- future support checks (is there a floor under this wall?).

Rebuilt incrementally on every add/remove, never by rescanning all pieces.

---

## 5. The 2D editor pane

**Rendering.** A single canvas, redrawn on demand (not a constant rAF loop) at
device pixel ratio. Draw order: background, grid lines, ghost of the level
below at low opacity, pieces on the current level, placement preview, selection
outlines, marquee.

**Element appearance.** Each element draws as a simple 2D glyph derived from its
`anchor` and `footprint`: cell parts fill the square, edge parts draw a thick
line on the correct cell edge, corner parts draw a dot. Colour comes from the
catalog so 2D and 3D agree.

**Tools**

| Tool | Key | Behaviour |
| --- | --- | --- |
| Select | `V` | Click to select, shift-click to add, drag for marquee |
| Place | `B` | Places the palette element; drag to paint a line or run of walls |
| Move | part of Select | Drag a selection; live collision feedback, drops on release |
| Erase | `E` | Click or drag to delete; also `Delete` on a selection |
| Area fill | `F` | Drag a rectangle to fill floors or outline walls |

**Feedback rules**

- A ghost of the pending piece follows the cursor, snapped to the grid.
- Invalid placement (occupied slot, off-grid, unsupported) renders red and the
  click is a no-op rather than a silent failure.
- Rotation with `R` cycles 0/90/180/270 and updates the ghost immediately.
- Camera: scroll to zoom at the cursor, middle-drag or space-drag to pan.

**Levels.** A level selector in the toolbar. Editing always targets the current
level. The level below is drawn faintly for alignment. `PageUp`/`PageDown` move
between levels.

---

## 6. The 3D pane

**Scene.** `WebGLRenderer` with antialiasing, a hemisphere light for ambient
fill plus one directional light for shading, a ground plane matching the grid
extent, and a `GridHelper` aligned to the 2D grid so the two panes read as the
same space.

**Camera.** `PerspectiveCamera` with `OrbitControls`: left-drag orbits,
scroll zooms, right-drag pans, with damping on. Plus:

- **Frame build** button and `Home` key, which fits the camera to the bounding
  box of all pieces.
- Preset views (top, front, corner) for quick screenshots.
- **Level clipping**: hide levels above the one being edited, so you can work on
  a ground floor without the roof in the way.

**Mesh generation.** `mesh-factory.js` turns an element's `mesh` recipe into a
`THREE.Group`. Geometry and material are cached per element type and shared
across every instance, so a hundred walls cost one geometry. If a build exceeds
roughly a thousand pieces and the frame rate suffers, the fallback is batching
per element type into an `InstancedMesh`; the delta-sync design already gives us
the per-type grouping needed to do that later without restructuring.

**Sync.** `sync.js` listens to model events:

- `piece:add` → build or clone the mesh, position it from grid coords, add to scene.
- `piece:update` → mutate the existing object's position/rotation only.
- `piece:remove` → remove and dispose if it was the last user of a cached resource.

Grid-to-world mapping is one function, shared with the 2D camera code, so the
two panes can never drift out of agreement.

**Selection linking.** Selecting in 2D applies an emissive highlight in 3D.
Clicking a mesh in 3D raycasts to a piece id, selects it in the model, and the
2D pane scrolls it into view. This is what makes the two panes feel like one
tool rather than an editor and a screenshot.

---

## 7. Undo, redo and history

Every mutation is a command with `do()` and `undo()`. The history stack holds
commands, not model snapshots, so memory stays flat on large builds. Drag
operations push a single command on release, not one per frame, so one undo
reverses one drag. `Ctrl+Z` / `Ctrl+Shift+Z`, with a depth cap of a few hundred.

---

## 8. Persistence and sharing

1. **Autosave** to `localStorage` on a debounce, restored on load.
2. **Named saves** in `localStorage`, listed in a load dialog.
3. **Export / import** a `.wardogs.json` file. Includes `schema` so old files
   can be migrated rather than rejected.
4. **Share link**: the build serialised to a compact form, deflated and
   base64url-encoded into the URL hash. Works with static hosting and no
   account. Large builds will exceed practical URL length; the UI falls back to
   offering the file export when that happens.
5. **Screenshot**: render the 3D canvas to a PNG download.

A PHP backend is only needed if short links, a shared gallery or server-side
storage become requirements. If so it is a thin addition: one endpoint that
stores a JSON blob and returns a slug, one that reads it back. The client is
designed to work fully without it, so this stays optional.

---

## 9. Delivery phases

Each phase ends with something runnable.

**Phase 0 — Scaffold.** Vite project, SCSS pipeline, two-pane responsive layout
shell with a placeholder in each pane, toolbar and palette chrome. No behaviour.

**Phase 1 — Model core.** `elements.json` seed catalog, `BuildModel`, occupancy
index, command and history classes, serialisation. Unit tests for collision,
rotation of multi-cell footprints, and undo/redo. No UI yet; this is the layer
everything else depends on and is the cheapest place to get it right.

**Phase 2 — 2D editing.** Grid rendering, pan/zoom, palette selection, place and
delete, ghost preview, validity feedback. At the end of this phase the tool is
usable as a 2D-only planner.

**Phase 3 — 3D view.** Scene setup, mesh factory, delta sync, OrbitControls,
frame-build. This is the first build where the core promise of the tool is
visible.

**Phase 4 — Full editing.** Selection and marquee, drag to move, rotate,
copy/paste, multi-level support with below-level ghosting and level clipping in
3D, 3D click-to-select.

**Phase 5 — Persistence.** Autosave, named saves, import/export, share link,
screenshot.

**Phase 6 — Polish.** Keyboard shortcut overlay, parts tally panel, empty-state
and first-run hints, touch support, colour and contrast pass, performance pass
against a deliberately large build.

Phases 0 through 3 are the minimum to demonstrate the concept. Phases 4 and 5
are what make it a tool people keep using.

---

## 10. Open questions

These change the data, not the architecture, so development can start before
they are answered. Answers are needed by Phase 2.

1. **The real element list.** What parts can actually be built in Wardogs, and
   what are their footprints and heights? The seed catalog is a placeholder.
2. **Grid units.** Does the game expose a build grid with known dimensions, and
   should the default canvas match a real plot size?
3. **Snapping rules.** Do walls genuinely sit on cell edges in-game, or are they
   cell-occupying like floors? This decides whether the `anchor` system earns its
   complexity or collapses to cells only.
4. **Stats worth tracking.** Are there resource costs, build times or durability
   values worth totalling in a side panel?
5. **Fidelity of the 3D view.** Are procedural blocks sufficient, or is matching
   the in-game look important enough to justify sourcing models?

---

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Catalog does not match the real game | Tool gives misleading plans | Keep all part definitions in `elements.json`; correcting them is an edit, not a refactor |
| Large builds slow the 3D view | Editing feels laggy | Shared geometry and delta sync from the start; `InstancedMesh` batching held in reserve |
| The two panes disagree about coordinates | Confusing and hard to debug | One shared grid-to-world function, unit tested |
| Edge/corner anchoring proves over-engineered | Wasted complexity | Question 3 above resolves it early; the catalog can declare everything cell-anchored with no code change |
| Touch and small screens | Unusable on tablets | Layout stacks to tabs under a breakpoint; touch treated as a Phase 6 pass, not retrofitted late |
