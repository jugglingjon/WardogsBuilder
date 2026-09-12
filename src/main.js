/**
 * Application bootstrap.
 *
 * Building happens in the 3D view: point at the site, see exactly where the
 * piece lands, click. The plan overview is a toggleable read-only projection
 * for judging the whole site at once.
 */
import './styles/main.scss';
import { BuildModel } from './model/build.js';
import { History } from './model/history.js';
import { catalog } from './model/catalog.js';
import { SceneView } from './three/scene.js';
import { MeshFactory } from './three/mesh-factory.js';
import { SceneSync } from './three/sync.js';
import { Placement } from './three/placement.js';
import { SceneEditor, TOOLS } from './three/editor.js';
import { Camera2D } from './editor/camera2d.js';
import { PlanRenderer } from './editor/plan-renderer.js';
import { OverviewController } from './editor/overview.js';
import { Toolbar } from './ui/toolbar.js';
import { Palette } from './ui/palette.js';
import { IssuesPanel, TallyPanel, StatsPanel } from './ui/panels.js';
import { bindShortcuts } from './ui/shortcuts.js';
import { Hints } from './ui/hints.js';
import { FileActions } from './ui/file-actions.js';
import { seedSampleBuild } from './sample-build.js';

document.querySelector('#app').innerHTML = `
  <div class="app">
    <header class="toolbar" id="toolbar"></header>
    <div class="workspace is-plan-hidden" id="workspace">
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

      <section class="pane pane--plan" id="plan-pane" hidden>
        <div class="pane__header">
          <span class="label">Plan</span>
          <span class="status"><span class="label">Overview only</span></span>
          <button class="btn" id="fit-plan" title="Frame the build">Fit</button>
        </div>
        <div class="pane__body" id="plan-body">
          <canvas id="plan-canvas"></canvas>
        </div>
      </section>

      <section class="pane">
        <div class="pane__header">
          <span class="label">Build</span>
          <span class="status" id="view-status"></span>
          <div class="toolbar__group">
            <button class="btn" data-view="top">Top</button>
            <button class="btn" data-view="front">Front</button>
            <button class="btn" data-view="corner">Corner</button>
            <button class="btn" id="frame-view" title="Frame the build">Frame</button>
          </div>
        </div>
        <div class="pane__body" id="view-body">
          <canvas id="view-canvas"></canvas>
          <div class="empty-state" id="hint" hidden></div>
        </div>
      </section>
    </div>
  </div>
`;

const model = new BuildModel({ catalog });
const history = new History();

// --- the 3D view, which is where building happens ---------------------------

const viewCanvas = document.querySelector('#view-canvas');
const view = new SceneView(viewCanvas, { model });
const sync = new SceneSync({ model, view, factory: new MeshFactory(catalog) });
const placement = new Placement({ model, view, sync });

const statusEl = document.querySelector('#view-status');
const editor = new SceneEditor(viewCanvas, {
  model,
  history,
  view,
  sync,
  placement,
  onStatus: ({ cell, z, message }) => {
    if (!cell) { statusEl.textContent = ''; return; }
    const position = `${cell.x}, ${cell.y}${z == null ? '' : ` · ${z} m`}`;
    statusEl.innerHTML = message
      ? `<span class="mono">${position}</span> <span class="status__warn">${message}</span>`
      : `<span class="mono">${position}</span>`;
  },
  onToolChange: (tool) => toolbar.setTool(tool)
});

const frameBuild = () => view.frame(model.count ? sync.bounds() : null);
document.querySelector('#frame-view').addEventListener('click', frameBuild);
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => view.view(button.dataset.view));
}
new ResizeObserver(([entry]) => {
  view.resize(entry.contentRect.width, entry.contentRect.height);
}).observe(document.querySelector('#view-body'));

// --- the plan overview, hidden until asked for ------------------------------

const planCamera = new Camera2D();
const planCanvas = document.querySelector('#plan-canvas');
const plan = new PlanRenderer(planCanvas, { model, camera: planCamera });
const overview = new OverviewController(planCanvas, { model, camera: planCamera, renderer: plan });
const planPane = document.querySelector('#plan-pane');
const workspace = document.querySelector('#workspace');

let planFramed = false;
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (width === 0) return;
  plan.resize(width, height);
  if (!planFramed) {
    overview.fit();
    planFramed = true;
  }
}).observe(document.querySelector('#plan-body'));

function togglePlan() {
  const showing = planPane.hidden;
  planPane.hidden = !showing;
  workspace.classList.toggle('is-plan-hidden', !showing);
  if (showing) overview.fit();
  return showing;
}
document.querySelector('#fit-plan').addEventListener('click', () => overview.fit());

// --- chrome ------------------------------------------------------------------

const files = new FileActions({ model, history, view });

const toolbar = new Toolbar(document.querySelector('#toolbar'), {
  model,
  history,
  onTool: (tool) => editor.setTool(tool),
  onTogglePlan: togglePlan,
  onBuilds: () => files.openBuildsDialog(),
  onShare: () => files.share(),
  onImage: () => files.screenshot()
});

const palette = new Palette(document.querySelector('#palette'), {
  model,
  onSelect: (id) => editor.setActiveElement(id)
});

new IssuesPanel(document.querySelector('#issues'), {
  model,
  onFocusPiece: (id) => model.select(id)
});
new TallyPanel(document.querySelector('#tally'), { model });
new StatsPanel(document.querySelector('#stats'), { model });
const help = bindShortcuts({ history });
document.querySelector('#help').addEventListener('click', () => help.showHelp());

// Frame the camera on the first piece placed, so the view is never left staring
// at empty ground.
let autoFramed = false;
model.on('piece:add', () => {
  if (autoFramed) return;
  autoFramed = true;
  queueMicrotask(frameBuild);
});

editor.setTool(TOOLS.PLACE);
palette.select(catalog.placeable()[0].id);
view.frame(null);

// Restore the last session, or open a build carried in the link, before the
// first autosave can overwrite either.
files.restore().then((outcome) => {
  new Hints(document.querySelector('#hint'), { model, view });
  if (outcome !== 'empty') {
    autoFramed = true;
    frameBuild();
  }
});

// Exposed for inspection from the console while the tool is being built.
window.wardogs = { model, history, catalog, view, sync, editor, placement, plan, overview, files, togglePlan, seedSampleBuild };
