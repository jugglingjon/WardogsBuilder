/**
 * Application bootstrap.
 *
 * Phases 0 to 2 are in place: the shell, the tested model core, and the 2D grid
 * editor. The 3D pane lands in phase 3.
 */
import './styles/main.scss';
import { BuildModel } from './model/build.js';
import { History } from './model/history.js';
import { catalog } from './model/catalog.js';
import { Camera2D } from './editor/camera2d.js';
import { GridRenderer } from './editor/grid-renderer.js';
import { EditorController, TOOLS } from './editor/controller.js';
import { SceneView } from './three/scene.js';
import { MeshFactory } from './three/mesh-factory.js';
import { SceneSync } from './three/sync.js';
import { bindPicking } from './three/picking.js';
import { Toolbar } from './ui/toolbar.js';
import { Palette } from './ui/palette.js';
import { IssuesPanel, TallyPanel, StatsPanel } from './ui/panels.js';
import { bindShortcuts } from './ui/shortcuts.js';
import { seedSampleBuild } from './sample-build.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="app">
    <header class="toolbar" id="toolbar"></header>
    <div class="workspace">
      <aside class="rail">
        <section class="rail__section">
          <div class="rail__title"><span class="label">Elements</span></div>
          <div id="palette"></div>
        </section>
        <section class="rail__section">
          <div class="rail__title"><span class="label">Build</span></div>
          <div class="issues" id="issues"></div>
        </section>
        <section class="rail__section">
          <div class="rail__title"><span class="label">Materials</span></div>
          <div class="tally" id="tally"></div>
        </section>
        <section class="rail__section">
          <div class="rail__title"><span class="label">Site</span></div>
          <div id="stats"></div>
        </section>
      </aside>

      <section class="pane">
        <div class="pane__header">
          <span class="label">Plan</span>
          <span class="status" id="plan-status"></span>
          <button class="btn" id="fit-plan" title="Frame the build (Home)">Fit</button>
        </div>
        <div class="pane__body" id="plan-body">
          <canvas id="plan-canvas"></canvas>
          <div class="empty-state" id="empty-state" hidden>
            <strong>Place a FOB to begin</strong>
            <span>It defines the 103 × 103 m area you can build in.</span>
          </div>
        </div>
      </section>

      <section class="pane">
        <div class="pane__header">
          <span class="label">View</span>
          <span class="status">
            <span class="label">Drag to orbit · scroll to zoom</span>
          </span>
          <div class="toolbar__group">
            <button class="btn" data-view="top">Top</button>
            <button class="btn" data-view="front">Front</button>
            <button class="btn" data-view="corner">Corner</button>
            <button class="btn" id="frame-view" title="Frame the build">Frame</button>
          </div>
        </div>
        <div class="pane__body" id="view-body">
          <canvas id="view-canvas"></canvas>
        </div>
      </section>
    </div>
  </div>
`;

const model = new BuildModel({ catalog });
const history = new History();

const camera = new Camera2D();
const canvas = document.querySelector('#plan-canvas');
const renderer = new GridRenderer(canvas, { model, camera });

const statusEl = document.querySelector('#plan-status');
const emptyState = document.querySelector('#empty-state');

const controller = new EditorController(canvas, {
  model,
  history,
  camera,
  renderer,
  onStatus: ({ cell, z, message }) => {
    if (!cell) { statusEl.textContent = ''; return; }
    const position = `${cell.x}, ${cell.y}${z == null ? '' : ` · z ${z}`}`;
    statusEl.innerHTML = message
      ? `<span class="mono">${position}</span> <span class="status__warn">${message}</span>`
      : `<span class="mono">${position}</span>`;
  },
  onToolChange: (tool) => toolbar.setTool(tool)
});

const toolbar = new Toolbar(document.querySelector('#toolbar'), {
  model,
  history,
  onTool: (tool) => controller.setTool(tool)
});

const palette = new Palette(document.querySelector('#palette'), {
  model,
  onSelect: (id) => controller.setActiveElement(id)
});

new IssuesPanel(document.querySelector('#issues'), {
  model,
  onFocusPiece: (id) => {
    model.select(id);
    const piece = model.piece(id);
    if (piece) model.setSlice(piece.z);
  }
});
new TallyPanel(document.querySelector('#tally'), { model });
new StatsPanel(document.querySelector('#stats'), { model });

// --- the 3D view ------------------------------------------------------------

const viewCanvas = document.querySelector('#view-canvas');
const view = new SceneView(viewCanvas, { model });
const sync = new SceneSync({ model, view, factory: new MeshFactory(catalog) });

const frameBuild = () => view.frame(model.count ? sync.bounds() : null);
document.querySelector('#frame-view').addEventListener('click', frameBuild);
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => view.view(button.dataset.view));
}

// Selecting in 3D brings the plan pane to that piece's elevation, so the two
// panes never disagree about what you are looking at.
bindPicking(viewCanvas, {
  model,
  view,
  onPick: (id) => {
    const piece = model.piece(id);
    if (piece) model.setSlice(piece.z);
  }
});

new ResizeObserver(([entry]) => {
  view.resize(entry.contentRect.width, entry.contentRect.height);
}).observe(document.querySelector('#view-body'));

bindShortcuts({ model, history });
document.querySelector('#fit-plan').addEventListener('click', () => controller.fit());

const updateEmptyState = () => { emptyState.hidden = model.count > 0; };
model.on('change', updateEmptyState);

// Frame the 3D camera on the first piece placed, so the view is never left
// staring at empty ground.
let autoFramed = false;
model.on('piece:add', () => {
  if (autoFramed) return;
  autoFramed = true;
  queueMicrotask(frameBuild);
});

// Size the canvas to its pane, and frame the site on first layout.
const body = document.querySelector('#plan-body');
let framed = false;
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  renderer.resize(width, height);
  if (!framed && width > 0) {
    camera.fit({ x0: 0, y0: 0, x1: model.grid.width, y1: model.grid.depth }, { width, height });
    renderer.invalidate();
    framed = true;
  }
}).observe(body);

controller.setTool(TOOLS.PLACE);
palette.select('fob');
updateEmptyState();

// Exposed for inspection from the console while the tool is being built.
window.wardogs = { model, history, catalog, camera, controller, view, sync, seedSampleBuild };
