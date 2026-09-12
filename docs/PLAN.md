# WardogsBuilder — Development Plan

A browser-based planning tool for designing constructions in the game Wardogs.
Building happens in a 3D view: point at the site, see exactly where the piece
lands, click. A plan overview can be toggled on beside it for judging the whole
site at once.

---

## 1. Goals and scope

**In scope for v1**

- Pick a building element from a palette and place it directly in the 3D view.
- See a ghost of where it would land before committing, red when it cannot go
  there, with the reason named.
- Move placed elements by dragging, rotate them, and delete them.
- Orbit, zoom and pan the camera around the build.
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

The catalog holds the game's 22 building elements, from a 1 × 1 × 1 Hesco block
at 10 material up to a 4 × 3 × 4 Drill Rig at 1351. Rather than repeat the table
here, `data/elements.json` is the record: it carries each element's dimensions,
cost, whether it can support others, whether it must sit on the ground, and how
it is drawn. Six of them support stacking (the two Hesco blocks, the Hesco Wall,
the Bunker, the Recon Tower and the Indirect Fire Shelter) and two must sit on
the ground (the Gate and the FOB).

```json
{
  "id": "stingray",
  "name": "Stingray",
  "category": "weapon",
  "size": [3, 3, 1],
  "cost": 91,
  "color": "#6f5537",
  "shape": "cylinder",
  "surface": "metal",
  "canSupport": false,
  "groundOnly": false
}
```

**Shape never changes the space an element takes.** A Stingray draws as a hollow
cylinder and a Hedgehog as a six-pointed star, but both fill every cell of their
declared box, and the placement ghost is drawn as that box rather than as the
shape. What you are spending is the volume, so that is what the preview shows.

Five further fields drive validation and reporting, all of them data rather than
code: `canSupport` marks the elements that others may stack on, `groundOnly`
marks those that may only sit at ground level, `cost` gives the building
material price, `fixed` marks an element the site places and the user cannot
touch, and `required` with `maxCount: 1` pins the FOB to exactly one per
construction.

### The site and its fixtures

The FOB is not something you place. Every construction has exactly one, fixed at
the centre of the site, free of charge, and it cannot be moved, rotated or
removed. It is scenery: no tool picks it, the palette does not offer it, and a
marquee never catches it.

That makes the site and the buildable region the same rectangle by construction.
The region is the FOB's 3 × 3 footprint expanded by 50 m in every horizontal
direction, so the ground is 103 × 103 m and the FOB sits at (50, 50). There is
no reason for a plane larger than the area you may build on, and no reason to
put the FOB anywhere but the middle of it.

Two things fall out of that. Validation no longer scans the build to find where
the region is, since it is always the grid. And the whole class of problems
around moving the FOB out from under existing work simply cannot happen.

Fixtures are catalog data: an element flagged `fixed` is placed at the centre of
the site when a build starts, and normalised back there when an older save or a
shared link is loaded, whether it was somewhere else, duplicated, or missing.

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
   input  -->    |    SceneEditor      |
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
             |   SceneSync    |  |   PlanRenderer   |
             |   (three.js)   |  |  (canvas, read   |
             |    the editor  |  |   only overview) |
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
│   ├── three/
│   │   ├── scene.js           # renderer, lights, ground, camera, section cut
│   │   ├── mesh-factory.js    # element -> geometry, cached per type
│   │   ├── sync.js            # model events -> scene graph deltas
│   │   ├── placement.js       # where a piece would land, and its ghost
│   │   └── editor.js          # pointer/keyboard handling, tools
│   ├── editor/
│   │   ├── camera2d.js        # pan/zoom, screen <-> grid transforms
│   │   ├── plan-renderer.js   # read-only top-down projection
│   │   └── overview.js        # pan, zoom and click-select for the plan
│   ├── ui/
│   │   ├── palette.js         # categorised element list
│   │   ├── toolbar.js         # tools, elevation slice, undo/redo
│   │   ├── inspector.js       # selected piece properties
│   │   ├── issues.js          # validation warnings panel
│   │   ├── tally.js           # element counts and material cost
│   │   └── shortcuts.js
│   └── styles/
└── tests/
```

---

## 5. Building in the 3D view

An earlier draft made the 2D grid the editor and the 3D view a preview. That was
wrong, and the reason is worth recording: height is invisible from above, so
every stacking feature became a workaround. An elevation slice selector, a
modifier key to override it, a rule that a piece drops down its column
regardless of which slice you were editing. That last rule existed precisely
because the slice you edit and the height you get were different things. In 3D
they are the same thing and the rule disappears.

**Targeting.** A ray from the cursor hits either the ground or a piece. Hitting
the top of something targets its own column; hitting a side targets the column
beside it. That is the rule every building game uses, and it is what lets you
run a wall along the outside of another one.

**Landing.** The piece settles on the highest surface under its footprint, or on
the ground. Since floating is illegal there is nowhere else it could go, so no
modifier key and no height control are needed.

**The ghost** is a translucent box at the landing spot, with its footprint
painted on the surface beneath it so the exact cells are never in doubt at a
grazing camera angle. It turns red when the placement is illegal and the status
bar names every reason, so a refusal is never a mystery.

**Mouse layout.** Left drives the active tool, right-drag orbits, middle-drag
pans, scroll zooms. Left is not shared with the camera, so a click never has to
be told apart from a camera move, and drag to paint a run of walls works.

**Touch layout.** A phone has no right button, and a finger that both builds and
turns the camera does neither well. So one finger orbits, two fingers pinch and
pan, and a tap uses the tool. Painting a run by dragging is a mouse affordance;
on touch it is repeated taps.

**Tools**

| Tool | Key | Behaviour |
| --- | --- | --- |
| Select | `V` | Click to select, shift-click to add, drag a piece to move it |
| Marquee | part of Select | Drag from empty ground; shift adds to the selection |
| Place | `B` | Places the palette element; drag to paint a run |
| Erase | `E` | Click or drag to delete; `Delete` clears a selection |

**Two rules that only show up under a held button.** Painting guards on the
column, not the landing height, because height rises the moment a piece lands
and a cursor that never moved would otherwise stack a tower on its own last
placement. And pieces painted during the current drag are excluded from
targeting, because otherwise each one becomes the next ray's target and a
stationary cursor walks a line of pieces sideways.

**Marquee selection** works in screen space rather than on the grid, since a
grid rectangle stops meaning anything in perspective. Each piece's eight box
corners are projected and the rectangle they bound is tested against the drag,
so a piece counts if it covers any of the dragged area. Corners behind the lens
are dropped rather than projected, which would mirror them to the wrong side of
the view.

Occlusion is deliberately ignored: a marquee that skipped the pieces hidden
behind a wall would be useless for the thing marquees are for. A consequence
worth knowing is that a tilted camera catches anything whose silhouette falls
under the rectangle, including pieces well behind the ones being aimed at.

The gesture costs no new modifier. A drag that starts on a piece moves it, a
drag that starts on empty ground rubber-bands, and a click on empty ground still
clears, with travel deciding between the last two on release.

**Moving** drags on a horizontal plane through the selection's base rather than
raycasting geometry that is moving with the cursor. The preview outlines where
the selection would land and turns red when it could not, and nothing is
committed until release, so one drag is one undo step.

## 5a. The plan overview

Toggled from the toolbar, hidden by default. It is read-only: a top-down
projection drawn lowest piece first, so what you see is the roofline. Pan, zoom
and click to select.

It exists for the one thing a perspective camera is bad at, which is judging a
whole 103 metre site at once: where the perimeter runs, how far apart things
are, what the footprint actually covers.

## 6. Validation

Two levels, both surfaced in a small issues panel rather than by blocking edits.

**Placement rules**, checked live during placement and move:

- Cells must be unoccupied.
- Cells must be inside the build region, which is the whole 103 × 103 m site.
- Cells must be at or below the 16 m build ceiling.
- **Support.** Every cell of a piece's base must rest on either the ground or
  the top face of a supporting element, with no exceptions and no overhang. A
  piece half on a block and half over air is rejected.
- **Only six elements can support.** The two Hesco blocks, the Hesco Wall, the
  Bunker, the Recon Tower and the Indirect Fire Shelter. This is the
  `canSupport` flag, so the rule is a catalog edit if the game says otherwise.
- **Some elements must sit on the ground**, whatever is under them. The Gate and
  the FOB carry `groundOnly`.

The reading of the support rule is that the chain must bottom out on the ground:
a piece rests on supporting elements, which themselves rest on supporting
elements or on the ground. A Stingray at height therefore needs a full 3 × 3 of
supporting tops at one level, nine large Hesco blocks or part of a Bunker roof.

**Build rules**, recomputed on change:

- Exactly one FOB, driven by `required: true` and `maxCount: 1` in the catalog.
  The site guarantees this, so the warning can no longer fire; it is kept as a
  net in case a load ever produces a build without one.

Making this data-driven rather than a hardcoded FOB check means other required
or limited elements cost nothing to add later.

**Moving a support** out from under something is allowed, and the piece left
floating is flagged rather than blocked or deleted. An edit that breaks
something reports what it broke and leaves the user to decide.

## 7. The 3D pane

**Scene.** `WebGLRenderer` with antialiasing, a hemisphere light for ambient
fill plus one directional light for shading and shadows, a ground plane matching
the grid extent, and a `GridHelper` aligned to the 2D grid so both panes read as
the same space.

**Meshes.** An element's shape compiles to a list of parts, each a geometry with
a fixed transform inside the piece: a plain block is one part, a doorway is two
jambs and a lintel, a hollow cylinder is two walls, a rim and a floor. Pieces of
a type share one `InstancedMesh` per part, so draw calls track parts per element
type rather than the size of the build. A thousand Hesco blocks cost one draw
call; a thousand cylinders cost four.

Every piece holds the same instance slot in each of its type's meshes, and
removing one swaps the last slot into the hole instead of rebuilding, which
makes an erase constant time.

Every piece outline is drawn as one merged line set, rebuilt from the model
rather than patched, and dropped above 2500 pieces where the lines stop reading
anyway. Surfaces are canvas-drawn: a wire cage over speckled fill for Hesco,
a subtler speckle for concrete.

Measured on a deliberately large build, in software rendering:

| Pieces | Draw calls | Frame |
| --- | --- | --- |
| 500 | 5 | 0.4 ms |
| 1500 | 5 | 0.3 ms |
| 3000 | 4 | 0.1 ms |

**Two things that had to be learned the hard way.** An `InstancedMesh` caches
the bounding volume it raycasts against and never notices that its instances
moved, so every write has to invalidate it or the cursor starts missing pieces
that are plainly under it. And lines raycast with a one metre threshold by
default, which put a fuzzy halo around every piece; the merged edge set is
excluded from raycasting entirely.

The build region draws as a translucent boundary on the ground plane, matching
the 2D pane.

**Section cut.** The Clip button cuts the view off just above the slice being
edited, using a real clipping plane rather than hiding whole pieces, because a
bunker's roof and its floor are one box. The cut faces are left open, which
reads clearly enough; capping them would need a stencil pass and is not worth it
yet.

**Camera.** `PerspectiveCamera` with `OrbitControls`, damping on: left-drag
orbits, scroll zooms, right-drag pans. Plus a **Frame build** button and `Home`
key that fits the camera to the bounding box of all pieces, preset top, front
and corner views, and a **slice clip** toggle that hides everything above the
current 2D slice so you can see inside a bunker while working on it.

**Selection.** A selected piece draws as an outline box, which keeps the shared
materials untouched. Selection is shared with the plan overview, so a piece
picked in either pane is highlighted in both. This is what makes the two panes feel like one tool
rather than an editor next to a screenshot.

---

## 8. Undo and redo

Every mutation is a command with `do()` and `undo()`. The history stack holds
commands, not model snapshots, so memory stays flat on large builds. A drag
pushes one command on release, not one per frame, so one undo reverses one drag.
`Ctrl+Z` and `Ctrl+Shift+Z`, capped at a few hundred entries.

---

## 9. Persistence and sharing

1. **Autosave** to `localStorage` on a debounce, restored on load. Every read is
   defensive: storage can be full, disabled, or hold something an older version
   wrote, and none of that should cost a session.
2. **Named saves** in `localStorage`, listed in the Builds dialog. Saving under
   an existing name overwrites that slot rather than duplicating it.
3. **Export and import** a `.wardogs.json` file, carrying `schema` so old files
   are migrated rather than rejected.
4. **Share link**: the build packed, deflated and base64url-encoded into the URL
   hash. Packing replaces field names and element ids with positions and indices
   before compressing, because the hash has to survive being pasted into a chat
   window. A seventeen piece build comes to about 260 characters. The dialog
   warns and points at the file export when a link gets long enough to be cut.
5. **Screenshot**: renders and reads back in the same tick, since the drawing
   buffer is cleared once a frame has been composited.

**Opening a link never costs you the session.** A build in the hash wins over
the autosave, but the autosave is first filed as a named save rather than
overwritten. A mangled link falls back to the autosave instead of throwing.

A PHP backend is only needed for short links, a shared gallery or server-side
storage. If those become requirements it is a thin addition of two endpoints.
The client is designed to work fully without it.

---

## 10. Delivery phases

Each phase ends with something runnable.

All phases are complete as of the current branch.

**Phase 0 — Scaffold.** ✅ Vite project, SCSS pipeline, two-pane responsive layout
shell, toolbar and palette chrome. No behaviour.

**Phase 1 — Model core.** ✅ Catalog loading, `BuildModel`, occupancy index,
rotation and footprint maths, placement validation including support and the
FOB region, commands and history, serialisation. Unit tests for collision,
rotated footprints, drop-to-support, region containment and undo. No UI; this is the layer everything depends on and the cheapest place to
get it right.

**Phase 2 — 2D editing.** ✅ Built, then replaced in phase 4a by 3D placement.
The renderer survives as the read-only plan overview; the slice editing, the
tools and the placement modifier were deleted.

**Phase 3 — 3D view.** ✅ Scene, box meshes, delta sync, OrbitControls, frame
build. The first build where the core promise is visible.

**Phase 4 — Full editing.** ✅ Selection and marquee, drag to move, rotate, copy
and paste, slice clipping in 3D, click-to-select in 3D, the issues panel.

**Phase 4a — Editing moved into 3D.** ✅ Placement, targeting, the ghost, moving
and the section cut all moved to the 3D view, and the plan pane became a
toggleable overview. The model core did not change: the landing rule was already
`dropZ` and the red ghost was already the support validation.

**Phase 5 — Persistence and reporting.** ✅ Autosave, named saves, import and
export, share link, screenshot, and the tally panel: element counts and total
building material cost.

**Phase 6 — Polish.** ✅ Shortcut overlay, first-run hints, element surfaces,
touch support, contrast pass, and a performance pass against a deliberately
large build.

Phases 0 through 3 are the minimum to demonstrate the concept. Phases 4 and 5
are what make it a tool worth returning to.

---

## 11. Decisions and remaining unknowns

Every question that blocked design has been answered. Recorded here so the
reasoning behind the rules is not lost:

| Question | Answer |
| --- | --- |
| Can elements float? | No. Every base cell must be supported |
| Partial support or full? | Full. No overhangs |
| What can support? | Hesco blocks of any type, and the Bunker. Nothing else |
| Is the ground flat? | Yes, for this tool's purposes |
| How many FOBs? | Exactly one |
| Build region | The FOB footprint plus 50 m in every direction, 103 × 103 m |
| Build height limit | 16 m |
| Resource budget | None, but every element carries a building material cost |

**Still unknown, none of it blocking:**

1. **Element facing.** Nothing in the catalog declares a front, so rotation only
   matters for the shape of a footprint. If an element turns out to have one,
   `facing` is where it goes.
2. **Whether the Hesco Wall is one construction or four blocks.** It is priced
   as one at 46, against 56 for four large blocks, so the tool counts it as one.

## 11a. Still open

**Capped cut faces.** The section cut leaves the cut surfaces open rather than
capped. It reads clearly enough as a section; capping needs a stencil pass.

**Shape detail.** The shapes are honest but plain: a coil, a pillow, a star, a
tube, an opening. Nothing carries the fittings a real Recon Tower or Drill Rig
would, and every one of those is still a block.

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Catalog does not match the real game | Plans mislead | All part definitions live in `elements.json`; corrections are edits, not refactors |
| Large builds slow the 3D view | Editing feels laggy | Resolved in phase 6: instanced meshes hold draw calls flat, and panel validation is coalesced to a frame rather than run per placed piece |
| Placeholder costs read as authoritative | Users plan against invented numbers | `costPlaceholder` in the catalog; the tally marks them rather than showing a bare figure |
| Support rules change once the game is checked | Existing builds become invalid | `canSupport` is catalog data and the validator reports rather than deletes, so a rule change flags affected pieces instead of destroying work |
| The two panes disagree about coordinates | Confusing and hard to debug | One shared `gridToWorld()`, unit tested |
| Touch and small screens | Unusable on tablets | Resolved in phase 6: one finger orbits and a tap builds, the layout stacks under a breakpoint, and hit targets grow on coarse pointers |
| Precision at grazing camera angles | Pieces land a cell off | The ghost paints its footprint on the landing surface, so the cells are visible before committing |
