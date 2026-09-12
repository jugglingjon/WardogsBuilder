/**
 * The plan overview: a read-only top-down projection of the build.
 *
 * Building happens in the 3D view. This pane exists for the one thing a
 * perspective camera is bad at, which is judging a whole 103 metre site at
 * once: where the perimeter runs, how far apart things are, what the footprint
 * actually covers. It draws every piece from above, lowest first, so what you
 * see is the roofline.
 */
import { boundsOf, rotatedSize } from '../model/geometry.js';
import { buildRegion, buildArea } from '../model/validate.js';

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
    fontDisplay: value('--font-display')
  };
}

export class PlanRenderer {
  #frame = null;

  constructor(canvas, { model, camera }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = model;
    this.camera = camera;
    this.theme = readTheme();
    this.dpr = 1;

    for (const event of ['change', 'selection:change', 'reset']) {
      model.on(event, () => this.invalidate());
    }
  }

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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.#drawGround();
    this.#drawGrid();
    this.#drawRegion();
    this.#drawPieces();
  }

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
    const line = (step, colour) => {
      ctx.beginPath();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
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
    if (camera.scale >= 7) line(1, theme.line);
    line(10, theme.lineMajor);
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
    // Lowest first, so the drawing reads as a roofline rather than a jumble.
    const ordered = model.pieces()
      .map((piece) => [piece, boundsOf(piece, model.elementOf(piece))])
      .sort((a, b) => a[1].z0 - b[1].z0);

    for (const [piece, bounds] of ordered) this.#drawPiece(piece, bounds);
    for (const [piece, bounds] of ordered) {
      if (model.selection.has(piece.id)) this.#drawSelection(bounds);
    }
  }

  #drawPiece(piece, bounds) {
    const { ctx, camera, model } = this;
    const element = model.elementOf(piece);
    const a = camera.gridToScreen(bounds.x0, bounds.y0);
    const w = bounds.w * camera.scale;
    const d = bounds.d * camera.scale;

    ctx.save();
    ctx.fillStyle = element.color;
    ctx.fillRect(a.px, a.py, w, d);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.px + 0.5, a.py + 0.5, w - 1, d - 1);
    ctx.globalAlpha = 1;
    this.#drawSeams(piece, element, bounds);
    this.#drawLabel(element, a, w, d);
    ctx.restore();
  }

  #drawSeams(piece, element, bounds) {
    const composed = element.composedOf;
    if (!composed || this.camera.scale < 5) return;
    const { ctx, camera } = this;
    const alongWidth = composed.axis === 'width';
    const rotated = rotatedSize(element.size, piece.rot);
    const horizontal = (piece.rot % 180 === 0) === alongWidth;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < composed.count; i++) {
      if (horizontal) {
        const x = bounds.x0 + (rotated[0] / composed.count) * i;
        const px = Math.round(camera.gridToScreen(x, 0).px) + 0.5;
        ctx.moveTo(px, camera.gridToScreen(0, bounds.y0).py);
        ctx.lineTo(px, camera.gridToScreen(0, bounds.y1).py);
      } else {
        const y = bounds.y0 + (rotated[1] / composed.count) * i;
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
    if (ctx.measureText(label).width < w - 8) ctx.fillText(label, a.px + w / 2, a.py + d / 2);
    ctx.restore();
  }

  #drawSelection(bounds) {
    const { ctx, camera, theme } = this;
    const a = camera.gridToScreen(bounds.x0, bounds.y0);
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(a.px - 1, a.py - 1, bounds.w * camera.scale + 2, bounds.d * camera.scale + 2);
    ctx.restore();
  }
}
