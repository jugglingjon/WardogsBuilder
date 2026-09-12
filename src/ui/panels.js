/**
 * Read-only reporting panels: build issues, the material tally, and grid stats.
 * Both redraw from the model on every change; they hold no state of their own.
 */
import { validateBuild, tally } from '../model/validate.js';
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
          <span class="tally__cost mono">${row.cost}</span>
        </div>
      `).join('')}
      <div class="tally__total">
        <span class="label">Total</span>
        <b class="mono">${result.total}</b>
      </div>
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
    // The site and the buildable region are the same rectangle, so there is
    // only one number worth showing.
    const { grid } = this.model;
    this.root.innerHTML = `
      <div class="stat"><span>Buildable area</span><span class="mono">${grid.width} × ${grid.depth} m</span></div>
      <div class="stat"><span>Height limit</span><span class="mono">${grid.height} m</span></div>
      <div class="stat"><span>Elements placed</span><span class="mono">${this.model.placedCount}</span></div>
      <div class="stat"><span>Occupied</span><span class="mono">${this.model.occupancy.size} m³</span></div>
    `;
  }
}
