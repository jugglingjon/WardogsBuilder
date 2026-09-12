/**
 * The plan pane: a single canvas redrawn on demand rather than on a constant
 * animation frame loop.
 *
 * Draw order is background, region, grid, pieces below, pieces above, pieces on
 * the slice, selection, ghost. Pieces below are drawn faintly so you can align
 * to what you are building on, and pieces above as outlines only so a roof
 * never hides the room under it.
 */
import { boundsOf, rotatedSize } from '../model/geometry.js';
import { buildRegion, buildArea } from '../model/validate.js';

/** Theme colours live in _tokens.scss; read them rather than duplicating them. */
function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const value = (name) => style.getPropertyValue(name).trim();
  return {
    ground: value('--c-grid-ground'),
    outside: value('--c-outside-region'),
    line: value('--c-grid-line'),
    lineMajor: value('--c-grid-line-major'),
    region: value('--c-region'),
    accent: value('--c-accent'),
    danger: value('--c-danger'),
    text: value('--c-text'),
    textFaint: value('--c-text-faint'),
    fontBody: value('--font-body'),
    fontDisplay: value('--font-display')
  };
}

export class GridRenderer {
  #frame = null;

  constructor(canvas, { model, camera }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = model;
    this.camera = camera;
    this.theme = readTheme();
    this.ghost = null; // { piece, valid, reasons }
    this.dpr = 1;

    for (const event of ['change', 'slice:change', 'selection:change', 'reset']) {
      model.on(event, () => this.invalidate());
    }
  }

  setGhost(ghost) {
    this.ghost = ghost;
    this.invalidate();
  }

  /** Coalesce every redraw request in a frame into one draw. */
  invalidate() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.draw();
    });
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.viewport = { width, height };
    this.draw();
  }

  draw() {
    if (!this.viewport) return;
    const { ctx } = this;
    const { width, height } = this.viewport;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this.#drawGround();
    this.#drawGrid();
    this.#drawRegion();
    this.#drawPieces();
    this.#drawGhost();
  }

  // --- layers ---------------------------------------------------------------

  #drawGround() {
    const { ctx, camera, model, theme } = this;
    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const area = buildArea(model);
    const origin = camera.gridToScreen(area.x0, area.y0);
    ctx.fillStyle = theme.ground;
    ctx.fillRect(
      origin.px, origin.py,
      (area.x1 - area.x0) * camera.scale, (area.y1 - area.y0) * camera.scale
    );
  }

  #drawGrid() {
    const { ctx, camera, model, theme } = this;
    const area = buildArea(model);
    const view = camera.visibleBounds(this.viewport);
    const x0 = Math.max(area.x0, view.x0);
    const x1 = Math.min(area.x1, view.x1);
    const y0 = Math.max(area.y0, view.y0);
    const y1 = Math.min(area.y1, view.y1);
    if (x1 <= x0 || y1 <= y0) return;

    const top = camera.gridToScreen(x0, y0);
    const bottom = camera.gridToScreen(x1, y1);

    const line = (step, colour, lineWidth) => {
      ctx.beginPath();
      ctx.strokeStyle = colour;
      ctx.lineWidth = lineWidth;
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const px = Math.round(camera.gridToScreen(x, 0).px) + 0.5;
        ctx.moveTo(px, top.py);
        ctx.lineTo(px, bottom.py);
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const py = Math.round(camera.gridToScreen(0, y).py) + 0.5;
        ctx.moveTo(top.px, py);
        ctx.lineTo(bottom.px, py);
      }
      ctx.stroke();
    };

    if (camera.scale >= 7) line(1, theme.line, 1);
    line(10, theme.lineMajor, 1);
  }

  #drawRegion() {
    const region = buildRegion(this.model);
    if (!region) return;
    const { ctx, camera, theme } = this;
    const a = camera.gridToScreen(region.x0, region.y0);
    const b = camera.gridToScreen(region.x1, region.y1);

    ctx.save();
    ctx.strokeStyle = theme.region;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(a.px, a.py, b.px - a.px, b.py - a.py);
    ctx.restore();
  }

  #drawPieces() {
    const { model } = this;
    const slice = model.slice;
    const below = [];
    const above = [];
    const current = [];

    for (const piece of model.pieces()) {
      const bounds = boundsOf(piece, model.elementOf(piece));
      if (slice >= bounds.z0 && slice < bounds.z1) current.push([piece, bounds]);
      else if (bounds.z1 <= slice) below.push([piece, bounds]);
      else above.push([piece, bounds]);
    }

    // Above last, so an outline is never buried under something solid. That is
    // the whole point of drawing the level above: seeing where the roof lands.
    for (const [piece, bounds] of below) this.#drawPiece(piece, bounds, 'below');
    for (const [piece, bounds] of current) this.#drawPiece(piece, bounds, 'current');
    for (const [piece, bounds] of above) this.#drawPiece(piece, bounds, 'above');
    for (const [piece, bounds] of current.concat(below, above)) {
      if (this.model.selection.has(piece.id)) this.#drawSelection(bounds);
    }
  }

  #drawPiece(piece, bounds, layer) {
    const { ctx, camera, model } = this;
    const element = model.elementOf(piece);
    const a = camera.gridToScreen(bounds.x0, bounds.y0);
    const w = bounds.w * camera.scale;
    const d = bounds.d * camera.scale;

    ctx.save();
    if (layer === 'current') {
      ctx.fillStyle = element.color;
      ctx.fillRect(a.px, a.py, w, d);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(a.px + 0.5, a.py + 0.5, w - 1, d - 1);
      ctx.globalAlpha = 1;
      this.#drawSeams(piece, element, bounds);
      this.#drawLabel(element, a, w, d);
    } else if (layer === 'below') {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = element.color;
      ctx.fillRect(a.px, a.py, w, d);
    } else {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = element.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(a.px + 0.5, a.py + 0.5, w - 1, d - 1);
    }
    ctx.restore();
  }

  /**
   * A Long Hesco Wall is four tall blocks, so it draws its seams rather than as
   * one undifferentiated slab.
   */
  #drawSeams(piece, element, bounds) {
    const composed = element.composedOf;
    if (!composed || this.camera.scale < 5) return;
    const { ctx, camera } = this;
    const alongWidth = composed.axis === 'width';
    const rotated = rotatedSize(element.size, piece.rot);
    const horizontal = (piece.rot % 180 === 0) === alongWidth;
    const count = composed.count;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < count; i++) {
      if (horizontal) {
        const x = bounds.x0 + (rotated[0] / count) * i;
        const px = Math.round(camera.gridToScreen(x, 0).px) + 0.5;
        ctx.moveTo(px, camera.gridToScreen(0, bounds.y0).py);
        ctx.lineTo(px, camera.gridToScreen(0, bounds.y1).py);
      } else {
        const y = bounds.y0 + (rotated[1] / count) * i;
        const py = Math.round(camera.gridToScreen(0, y).py) + 0.5;
        ctx.moveTo(camera.gridToScreen(bounds.x0, 0).px, py);
        ctx.lineTo(camera.gridToScreen(bounds.x1, 0).px, py);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  #drawLabel(element, a, w, d) {
    if (w < 46 || d < 17) return;
    const { ctx, theme } = this;
    ctx.save();
    ctx.font = `600 10px ${theme.fontDisplay}`;
    ctx.fillStyle = 'rgb(0 0 0 / 0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = element.name.toUpperCase();
    if (ctx.measureText(label).width < w - 8) {
      ctx.fillText(label, a.px + w / 2, a.py + d / 2);
    }
    ctx.restore();
  }

  #drawSelection(bounds) {
    const { ctx, camera, theme } = this;
    const a = camera.gridToScreen(bounds.x0, bounds.y0);
    const w = bounds.w * camera.scale;
    const d = bounds.d * camera.scale;
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(a.px - 1, a.py - 1, w + 2, d + 2);
    ctx.restore();
  }

  #drawGhost() {
    if (!this.ghost) return;
    const { ctx, camera, model, theme } = this;
    const { piece, valid } = this.ghost;
    const bounds = boundsOf(piece, model.elementOf(piece));
    const element = model.elementOf(piece);
    const a = camera.gridToScreen(bounds.x0, bounds.y0);
    const w = bounds.w * camera.scale;
    const d = bounds.d * camera.scale;

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = valid ? element.color : theme.danger;
    ctx.fillRect(a.px, a.py, w, d);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? theme.accent : theme.danger;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(a.px + 0.5, a.py + 0.5, w - 1, d - 1);
    ctx.restore();
  }
}
