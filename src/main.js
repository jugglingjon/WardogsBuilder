/**
 * Application bootstrap.
 *
 * Phases 0 and 1 are in place: the layout shell, the palette and reporting
 * panels, and the tested model core beneath them. The two panes are still
 * placeholders; the 2D editor lands in phase 2 and the 3D view in phase 3.
 */
import './styles/main.scss';
import { BuildModel } from './model/build.js';
import { History } from './model/history.js';
import { catalog } from './model/catalog.js';
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
          <span class="label" id="plan-hint"></span>
        </div>
        <div class="pane__body">
          <div class="pane__placeholder">
            <strong>2D grid editor</strong>
            <span>Phase 2: place, move and delete on the grid</span>
          </div>
        </div>
      </section>

      <section class="pane">
        <div class="pane__header">
          <span class="label">View</span>
          <span class="label">Orbit · zoom · pan</span>
        </div>
        <div class="pane__body">
          <div class="pane__placeholder">
            <strong>3D preview</strong>
            <span>Phase 3: live box geometry with an orbit camera</span>
          </div>
        </div>
      </section>
    </div>
  </div>
`;

const model = new BuildModel({ catalog });
const history = new History();

// A sample build so the shell exercises the model end to end before the editor
// exists. Phase 2 starts from an empty site instead.
seedSampleBuild(model);

new Toolbar(document.querySelector('#toolbar'), { model, history });

const palette = new Palette(document.querySelector('#palette'), {
  model,
  onSelect: (id) => {
    document.querySelector('#plan-hint').textContent = `Selected: ${catalog.get(id).name}`;
  }
});
palette.select('hesco_block');

new IssuesPanel(document.querySelector('#issues'), {
  model,
  onFocusPiece: (id) => model.select(id)
});
new TallyPanel(document.querySelector('#tally'), { model });
new StatsPanel(document.querySelector('#stats'), { model });

bindShortcuts({ model, history });

// Exposed for inspection from the console while the editor is being built.
// Namespaced, because window.history is read-only.
window.wardogs = { model, history, catalog };
