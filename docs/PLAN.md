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
- Stacking: elements have real heights and can sit on top of each other.
- Save, load, export and share a design.

**Out of scope for v1**

- Accurate in-game art assets. Every element renders as a labelled box of its
  true dimensions, not a game model.
- Simulation of game rules beyond placement validity and a parts tally.
- Multi-user editing.

---

## 2. The world model

This is the foundation everything else derives from, and it is now pinned down.

- **The grid is 1 m × 1 m × 1 m cells.** One grid cell is one cubic metre.
- **Every element is an axis-aligned box** occupying a whole number of cells,
  declared as `width × depth × height`. A Bunker at `4 × 4 × 4` fills 64 cells.
- **Coordinates are integers.** A piece is stored as its minimum corner
  `(x, y, z)`, where `x` runs along width, `y` along depth, and `z` is height
  above ground. `z: 0` sits on the ground.
- **Rotation is 0/90/180/270 only.** At 90 and 270 the width and depth swap;
  height never changes. Arbitrary angles are excluded because the game is
  grid-based and free rotation would break snapping.

Because everything is a whole-cell box, there is no need for the edge-anchored
and corner-anchored placement system an earlier draft of this plan proposed. All
elements occupy cells. That removes a whole class of complexity from the
occupancy index, the 2D renderer and the collision tests.

Note on axes: the model uses Z for height, three.js uses Y. A single
`gridToWorld()` function owns that swap and both panes call it, so the two views
cannot drift apart.

### The element catalog

Every building element is data in `data/elements.json`, seeded with the six
known elements. Adding a part is an edit to that file, not a code change.

| Element | Size (w × d × h) | Notes |
| --- | --- | --- |
| FOB | 3 × 3 × 1 | Required in every construction |
| Hesco Block | 1 × 1 × 1 | |
| Tall Hesco Block | 1 × 1 × 2 | |
| Long Hesco Wall | 4 × 1 × 2 | Four tall Hesco blocks in a row |
| Bunker | 4 × 4 × 4 | |
| Air Defense | 3 × 3 × 1 | |

```json
{
  "id": "hesco_wall_long",
  "name": "Long Hesco Wall",
  "category": "fortification",
  "size": [4, 1, 2],
  "color": "#b9a074",
  "composedOf": { "element": "hesco_block_tall", "count": 4, "axis": "width" }
}
```

`composedOf` records that a part is shorthand for a repeated primitive. It earns
its place twice: the renderers draw the seams between the four blocks instead of
one undifferentiated slab, and the parts tally can report a Long Hesco Wall as
either one piece or four blocks depending on how the game counts them.

`required: true` on the FOB drives build validation (section 6).

### The build region

The FOB does not merely have to exist, it defines where building is allowed.
The buildable region is the FOB's 3 × 3 footprint expanded by 50 m in every
horizontal direction, giving a 103 × 103 m square centred on the FOB. Every
cell of every piece must fall inside it.

This sets the default grid: rather than an arbitrary plot, the grid is the build
region itself, so the editable area and the legal area are the same thing and
there is no dead space to scroll through. Before a FOB is placed there is no
region, so the grid shows a neutral 103 × 103 area and the first FOB placement
fixes it.

### The build document

```js
{
  schema: 1,
  name: "Forward Outpost",
  grid: { width: 103, depth: 103, height: 16 },  // in metres, sized to the FOB region
  pieces: [
    { id: "p1", type: "bunker", x: 12, y: 7, z: 0, rot: 90 }
  ]
}
```

### Occupancy index

A `Map` keyed by `` `${z}:${x}:${y}` ``, one entry per occupied cubic metre,
pointing at the piece id filling it. Used for collision tests, hit-testing under
the cursor, and support checks. Updated incrementally on every add and remove,
never by rescanning the build.

A Bunker costs 64 entries. Even a heavily built region is tens of thousands of
entries, which a `Map` handles without trouble, so the simple approach is the
right one and a sparse octree is not needed.

---

## 3. Stack

Chosen to match a front-end workflow of HTML, SCSS and vanilla JS modules.

| Concern | Choice | Why |
| --- | --- | --- |
| Build/dev server | Vite | Fast HMR, native ES modules, compiles SCSS with no extra config |
| Language | Vanilla ES modules | No framework needed; one screen with two custom renderers |
| Styles | SCSS, one partial per component | Matches existing workflow |
| 2D editor | HTML5 Canvas 2D | Thousands of cells redrawn per frame; DOM nodes would not keep up |
| 3D view | three.js + OrbitControls | Orbit, zoom and pan come for free and correct |
| Tests | Vitest for model logic, Playwright for a smoke test | The grid and occupancy logic is where bugs hide and is pure functions |
| Backend | None in v1 | Static hosting. An optional PHP endpoint is discussed in section 9 |

---

## 4. Architecture

One source of truth, two views. The 2D pane is the only editor; the 3D pane is a
subscriber that also supports click-to-select.

```
                 +---------------------+
   input  -->    |   EditorController  |
 (mouse/keys)    |  tools, selection   |
                 +----------+----------+
                            | commands
                            v
                 +---------------------+
                 |     BuildModel      |  <-- single source of truth
                 |  pieces, occupancy  |
                 +----+-----------+----+
                      | change    | change
                      v           v
             +----------------+  +------------------+
             |  GridRenderer  |  |  SceneRenderer   |
             |   (canvas 2D)  |  |   (three.js)     |
             +----------------+  +------------------+
```

The model emits granular events (`piece:add`, `piece:remove`, `piece:update`,
`selection:change`, `slice:change`). The 3D renderer keeps a
`Map<pieceId, THREE.Object3D>` and applies deltas rather than rebuilding the
scene, which is what keeps dragging smooth. Every mutation goes through a
command object, so undo and redo are uniform.

### Directory layout

```
/
├── index.html
├── package.json
├── vite.config.js
├── data/elements.json         # the building element catalog
├── docs/PLAN.md
├── src/
│   ├── main.js
│   ├── model/
│   │   ├── build.js           # BuildModel: pieces, events
│   │   ├── catalog.js         # loads + indexes elements.json
│   │   ├── occupancy.js       # cell index, collision and support tests
│   │   ├── geometry.js        # rotation, footprint expansion, gridToWorld
│   │   ├── validate.js        # build-level rules (FOB required, support)
│   │   ├── commands.js        # AddPiece, MovePiece, RotatePiece, DeletePieces
│   │   ├── history.js         # undo/redo stack
│   │   └── serialize.js       # save/load/export, schema versioning
│   ├── editor/
│   │   ├── grid-renderer.js   # grid, pieces, ghosts, selection
│   │   ├── camera2d.js        # pan/zoom, screen <-> grid transforms
│   │   ├── controller.js      # pointer/keyboard handling, tool dispatch
│   │   └── tools/             # select.js, place.js, move.js, erase.js
│   ├── three/
│   │   ├── scene.js           # renderer, lights, ground, grid helper
│   │   ├── mesh-factory.js    # element -> geometry, cached per type
│   │   ├── sync.js            # model events -> scene graph deltas
│   │   └── picking.js         # raycast select, hover highlight
│   ├── ui/
│   │   ├── palette.js         # categorised element list
│   │   ├── toolbar.js         # tools, elevation slice, undo/redo
│   │   ├── inspector.js       # selected piece properties
│   │   ├── issues.js          # validation warnings panel
│   │   └── shortcuts.js
│   └── styles/
└── tests/
```

---

## 5. The 2D editor pane

**Elevation slices, not floors.** Because elements have real metre heights and
stack, the left pane edits one 1 m elevation slice at a time. The toolbar shows
the current slice, `z = 0` being ground level. A Bunker placed at `z = 0`
occupies slices 0 through 3, so it appears on all four.

Each slice draws in three layers so context is never lost:

1. Pieces whose volume includes this slice, drawn solid.
2. Pieces below, drawn faintly, so you can align to what you are building on.
3. Pieces above, drawn as a thin outline only, so a roof does not hide the room.

**Rendering.** A single canvas redrawn on demand at device pixel ratio. Each
piece draws as a rectangle of its rotated width and depth, filled with its
catalog colour and labelled when the zoom level allows. `composedOf` parts draw
their internal seams.

The build region draws as a boundary line with the area outside it dimmed, so
the limit is visible at all times rather than discovered by a rejected click.

**Tools**

| Tool | Key | Behaviour |
| --- | --- | --- |
| Select | `V` | Click to select, shift-click to add, drag for marquee |
| Place | `B` | Places the palette element; drag to repeat along a line |
| Move | part of Select | Drag a selection, with live collision feedback |
| Erase | `E` | Click or drag to delete; `Delete` clears a selection |

**Feedback rules**

- A ghost of the pending piece follows the cursor at its true rotated footprint.
- Invalid placement renders red and the click is a no-op rather than a silent
  failure. Invalid means: overlapping an occupied cell, outside the build
  region, or unsupported. The ghost reports which, so a rejected placement is
  never a mystery.
- `R` rotates through 0/90/180/270 and the ghost updates immediately. Rotation
  is about the piece's own footprint centre, so a `4 × 1` wall pivots where you
  expect rather than flinging itself across the grid.
- Scroll zooms at the cursor; middle-drag or space-drag pans.
- `PageUp` and `PageDown` move between elevation slices.

**Placement height.** When you place onto a slice, the piece drops to rest on
whatever is beneath it within that column rather than floating at the slice
height. This means walls stack naturally when you draw them over existing ones,
and it is the behaviour that makes vertical building feel right without asking
the user to think in Z. A modifier key forces placement at exactly the current
slice for the cases where floating is intended.

---

## 6. Validation

Two levels, both surfaced in a small issues panel rather than by blocking edits.

**Placement rules**, checked live during placement and move:

- Cells must be unoccupied.
- Cells must be inside the build region, the 103 × 103 m square centred on the
  FOB. The FOB itself is exempt, since it creates the region.
- Every piece must be supported: each cell of its base must sit on the ground or
  on the top face of another piece. Floating is not allowed.

**Build rules**, recomputed on change:

- At least one FOB must be present, driven by `required: true` in the catalog.
  A build without one shows a persistent warning, since the game will not accept
  the construction.

Making this data-driven rather than a hardcoded FOB check means other required
or limited elements cost nothing to add later.

**Moving or deleting the FOB** shifts the region out from under existing pieces.
The tool never silently deletes work: affected pieces stay put, are flagged as
out of region in the issues panel, and can be jumped to from there. The user
decides whether to move them or move the FOB back.

---

## 7. The 3D pane

**Scene.** `WebGLRenderer` with antialiasing, a hemisphere light for ambient
fill plus one directional light for shading and shadows, a ground plane matching
the grid extent, and a `GridHelper` aligned to the 2D grid so both panes read as
the same space.

**Meshes.** Every element is a box of its declared dimensions, so the mesh
factory is trivial: one `BoxGeometry` per element type, cached and shared across
every instance. A hundred Hesco blocks cost one geometry and one material.
`composedOf` parts render their sub-blocks with a small gap so the seams read.
Visual detail beyond boxes (a radar dish on the Air Defense, texture on the
Hesco gabions) is a Phase 6 pass, deliberately after the tool works.

The build region draws as a translucent boundary on the ground plane, matching
the 2D pane.

**Camera.** `PerspectiveCamera` with `OrbitControls`, damping on: left-drag
orbits, scroll zooms, right-drag pans. Plus a **Frame build** button and `Home`
key that fits the camera to the bounding box of all pieces, preset top, front
and corner views, and a **slice clip** toggle that hides everything above the
current 2D slice so you can see inside a bunker while working on it.

**Selection linking.** Selecting in 2D highlights the piece in 3D. Clicking a
mesh in 3D raycasts to a piece id, selects it in the model, and the 2D pane
scrolls it into view. This is what makes the two panes feel like one tool
rather than an editor next to a screenshot.

---

## 8. Undo and redo

Every mutation is a command with `do()` and `undo()`. The history stack holds
commands, not model snapshots, so memory stays flat on large builds. A drag
pushes one command on release, not one per frame, so one undo reverses one drag.
`Ctrl+Z` and `Ctrl+Shift+Z`, capped at a few hundred entries.

---

## 9. Persistence and sharing

1. **Autosave** to `localStorage` on a debounce, restored on load.
2. **Named saves** in `localStorage`, listed in a load dialog.
3. **Export and import** a `.wardogs.json` file, carrying `schema` so old files
   are migrated rather than rejected.
4. **Share link**: the build deflated and base64url-encoded into the URL hash.
   Works on static hosting with no account. Oversized builds fall back to
   offering the file export.
5. **Screenshot**: render the 3D canvas to a PNG download.

A PHP backend is only needed for short links, a shared gallery or server-side
storage. If those become requirements it is a thin addition of two endpoints.
The client is designed to work fully without it.

---

## 10. Delivery phases

Each phase ends with something runnable.

**Phase 0 — Scaffold.** Vite project, SCSS pipeline, two-pane responsive layout
shell, toolbar and palette chrome. No behaviour.

**Phase 1 — Model core.** Catalog loading, `BuildModel`, occupancy index,
rotation and footprint maths, placement validation including support and the
FOB region, commands and history, serialisation. Unit tests for collision,
rotated footprints, drop-to-support, region containment and undo. No UI; this is the layer everything depends on and the cheapest place to
get it right.

**Phase 2 — 2D editing.** Grid rendering, pan and zoom, elevation slices with
the below/above layers, palette selection, place and delete, ghost preview,
validity feedback. At this point the tool is usable as a 2D-only planner.

**Phase 3 — 3D view.** Scene, box meshes, delta sync, OrbitControls, frame
build. The first build where the core promise is visible.

**Phase 4 — Full editing.** Selection and marquee, drag to move, rotate, copy
and paste, slice clipping in 3D, click-to-select in 3D, the issues panel.

**Phase 5 — Persistence.** Autosave, named saves, import and export, share link,
screenshot.

**Phase 6 — Polish.** Shortcut overlay, parts tally, empty-state hints, element
visual detail, touch support, contrast pass, performance pass against a
deliberately large build.

Phases 0 through 3 are the minimum to demonstrate the concept. Phases 4 and 5
are what make it a tool worth returning to.

---

## 11. Open questions

Answered so far: elements must be supported and cannot float; the FOB defines a
buildable square extending 50 m from its footprint in every direction.

None of the below block starting. They are ordered by when an answer is needed.

1. **Full or partial support** (Phase 1). Must every cell of a piece's base be
   supported, or is an overhang allowed? A Long Hesco Wall resting on one block
   with three cells hanging is legal under a partial rule and illegal under a
   full one. Implemented as full support until told otherwise, because it is the
   stricter reading and relaxing it later invalidates nothing already drawn.
2. **Is the ground flat** (Phase 2). The tool models a flat plane. If real
   terrain is uneven, a plan that works here may not place in game, and the
   model would need a ground height per cell. This is the single assumption most
   likely to cause a mismatch with the game.
3. **Multiple FOBs** (Phase 2). Is more than one allowed in a construction, and
   if so does each add its own region so the buildable area is the union? This
   decides whether the region is one square or a merged shape, which changes
   both the containment test and how the boundary is drawn.
4. **Maximum build height** (Phase 2). The grid assumes 16 m. Is there a real
   ceiling, and does the 50 m region have a vertical limit of its own?
5. **Can anything be stacked on anything** (Phase 2). Does the game allow an Air
   Defense on a Bunker roof, or are some elements ground-only? A `groundOnly`
   flag in the catalog covers it if so.
6. **Element cap or cost** (Phase 4). Is there a limit on how many elements a
   construction may contain, or a resource budget? Either turns the parts tally
   from a curiosity into a constraint worth checking against.
7. **Element facing** (Phase 4). Do asymmetric elements have a meaningful
   orientation, such as an Air Defense arc or a bunker entrance, that should be
   drawn in 2D rather than left implicit in the rotation value?
8. **Long Hesco Wall accounting** (Phase 6). Does the game count one as a single
   construction or as four tall blocks? `composedOf` already records both
   readings; this only decides what the tally reports.
9. **More elements** (any time). The catalog has six. Anything else in the game
   is a JSON entry, not a code change.

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Catalog does not match the real game | Plans mislead | All part definitions live in `elements.json`; corrections are edits, not refactors |
| Large builds slow the 3D view | Editing feels laggy | Shared cached geometry and delta sync from the start; `InstancedMesh` batching held in reserve |
| Real terrain is not flat | Plans do not place in game | Question 2 resolves it early; a per-cell ground height is an additive change to the occupancy floor, not a rewrite |
| Support strictness guessed wrong | Legal builds rejected, or illegal ones accepted | Full support enforced as the stricter reading, relaxable without invalidating existing builds |
| The two panes disagree about coordinates | Confusing and hard to debug | One shared `gridToWorld()`, unit tested |
| Touch and small screens | Unusable on tablets | Layout stacks to tabs under a breakpoint; touch handled as a Phase 6 pass, not retrofitted late |
