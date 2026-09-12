/**
 * Read-only reporting panels: build issues, the material tally, and grid stats.
 * Both redraw from the model on every change; they hold no state of their own.
 */
import { validateBuild, tally, buildRegion } from '../model/validate.js';
import { coalesce } from './coalesce.js';

export class IssuesPanel {
  constructor(root, { model, onFocusPiece }) {
    this.root = root;
    this.model = model;
    this.root.addEventListener('click', (event) => {
      const row = event.target.closest('[data-piece]');
      if (row) onFocusPiece?.(row.dataset.piece);
    });
    this.refresh = coalesce(() => this.render());
    model.on('change', this.refresh);
    this.render();
  }

  render() {
    const issues = validateBuild(this.model);
    if (!issues.length) {
      this.root.innerHTML = '<div class="issues__clear">Build is valid</div>';
      return;
    }
    this.root.innerHTML = issues.map((issue) => `
      <${issue.pieceId ? 'button type="button"' : 'div'}
         class="issue ${issue.level === 'error' ? 'is-error' : ''}"
         ${issue.pieceId ? `data-piece="${issue.pieceId}"` : ''}>
        <span>${issue.message}</span>
      </${issue.pieceId ? 'button' : 'div'}>
    `).join('');
  }
}

export class TallyPanel {
  constructor(root, { model }) {
    this.root = root;
    this.model = model;
    this.refresh = coalesce(() => this.render());
    model.on('change', this.refresh);
    this.render();
  }

  render() {
    const result = tally(this.model);
    if (!result.rows.length) {
      this.root.innerHTML = '<div class="tally__note">Nothing placed yet.</div>';
      return;
    }
    this.root.innerHTML = `
      ${result.rows.map((row) => `
        <div class="tally__row">
          <span>${row.name}</span>
          <span class="tally__count mono">×${row.count}</span>
          <span class="tally__cost mono">${row.cost}${row.placeholder ? '*' : ''}</span>
        </div>
      `).join('')}
      <div class="tally__total">
        <span class="label">Total</span>
        <b class="mono">${result.total}${result.hasPlaceholders ? '*' : ''}</b>
      </div>
      ${result.hasPlaceholders
        ? '<p class="tally__note">* Placeholder cost, not yet confirmed against the game.</p>'
        : ''}
    `;
  }
}

export class StatsPanel {
  constructor(root, { model }) {
    this.root = root;
    this.model = model;
    this.refresh = coalesce(() => this.render());
    model.on('change', this.refresh);
    model.on('slice:change', this.refresh);
    this.render();
  }

  render() {
    const { grid } = this.model;
    const region = buildRegion(this.model);
    this.root.innerHTML = `
      <div class="stat"><span>Grid</span><span class="mono">${grid.width} × ${grid.depth} × ${grid.height} m</span></div>
      <div class="stat"><span>Build region</span><span class="mono">${
        region ? `${region.x1 - region.x0} × ${region.y1 - region.y0} m` : 'no FOB placed'
      }</span></div>
      <div class="stat"><span>Elements</span><span class="mono">${this.model.count}</span></div>
      <div class="stat"><span>Occupied</span><span class="mono">${this.model.occupancy.size} m³</span></div>
    `;
  }
}
