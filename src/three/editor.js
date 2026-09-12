/**
 * The editor. Building happens in the 3D view, directly on the model.
 *
 * Left button drives the active tool, right-drag orbits and middle-drag pans,
 * so a click never has to be told apart from a camera move. Every mutation goes
 * through a command, so undo stays uniform, and a whole drag is one step.
 */
import * as THREE from 'three';
import {
  canPlace, canMove, canPlaceAll, dropZ, REASON_TEXT
} from '../model/validate.js';
import { ROTATIONS, rotatedSize, boundsOf } from '../model/geometry.js';
import { boundsOfPieces } from '../model/query.js';
import { addPiece, deletePieces, movePieces, rotatePiece, composite } from '../model/commands.js';

export const TOOLS = { SELECT: 'select', PLACE: 'place', ERASE: 'erase' };

export class SceneEditor {
  #paint = null;
  #move = null;
  #down = null;
  #pointers = new Set();
  #clipboard = null;
  #lastCell = null;
  #painted = new Set();
  #paintedIds = new Set();

  constructor(canvas, { model, history, view, sync, placement, onStatus, onToolChange }) {
    this.canvas = canvas;
    this.model = model;
    this.sync = sync;
    this.history = history;
    this.view = view;
    this.placement = placement;
    this.onStatus = onStatus;
    this.onToolChange = onToolChange;
    this.tool = TOOLS.PLACE;

    // Left is the tool, not the camera.
    view.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE
    };

    this.movePreview = new THREE.Group();
    view.scene.add(this.movePreview);

    this.#bindPointer();
    this.#bindKeyboard();
    model.on('change', () => this.#refresh());
  }

  setTool(tool) {
    this.tool = tool;
    if (tool !== TOOLS.PLACE) this.placement.clear();
    this.canvas.style.cursor = tool === TOOLS.SELECT ? 'default' : 'crosshair';
    this.onToolChange?.(tool);
    this.#status();
  }

  setActiveElement(id) {
    this.placement.setElement(id);
    if (id) this.setTool(TOOLS.PLACE);
  }

  rotate() {
    if (this.tool === TOOLS.PLACE) {
      const next = ROTATIONS[(ROTATIONS.indexOf(this.placement.rotation) + 1) % ROTATIONS.length];
      this.placement.setRotation(next);
      this.#refresh();
      return;
    }
    const [id] = [...this.model.selection];
    if (!id) return;
    const piece = this.model.piece(id);
    const next = ROTATIONS[(ROTATIONS.indexOf(piece.rot) + 1) % ROTATIONS.length];
    const command = rotatePiece(this.model, id, next);
    command.do();
    const ok = canPlace(this.model, this.model.piece(id), { ignoreId: id }).ok;
    command.undo();
    if (ok) this.history.run(command);
    else this.#status('Cannot rotate there');
  }

  deleteSelection() {
    if (!this.model.selection.size) return;
    this.history.run(deletePieces(this.model, [...this.model.selection]));
  }

  copy() {
    const ids = [...this.model.selection];
    if (!ids.length) return;
    const box = boundsOfPieces(this.model, ids);
    this.#clipboard = ids.map((id) => {
      const piece = this.model.piece(id);
      return {
        type: piece.type, rot: piece.rot,
        dx: piece.x - box.x0, dy: piece.y - box.y0, dz: piece.z - box.z0
      };
    });
    this.#status(`Copied ${ids.length} ${ids.length === 1 ? 'piece' : 'pieces'}`);
  }

  /** Paste at the cursor, dropping the group onto whatever is under it. */
  paste() {
    if (!this.#clipboard?.length) return;
    const anchor = this.#lastCell;
    if (!anchor) {
      this.#status('Point at the site to paste');
      return;
    }

    let baseZ = 0;
    for (const entry of this.#clipboard) {
      const footprint = {
        type: entry.type, rot: entry.rot,
        x: anchor.x + entry.dx, y: anchor.y + entry.dy
      };
      baseZ = Math.max(baseZ, dropZ(this.model, footprint) - entry.dz);
    }
    const specs = this.#clipboard.map((entry) => ({
      type: entry.type, rot: entry.rot,
      x: anchor.x + entry.dx, y: anchor.y + entry.dy, z: baseZ + entry.dz
    }));

    const result = canPlaceAll(this.model, specs);
    if (!result.ok) {
      this.#status(`Cannot paste here: ${result.reasons.map((r) => REASON_TEXT[r]).join(' · ')}`);
      return;
    }
    const group = composite(`Paste ${specs.length} ${specs.length === 1 ? 'piece' : 'pieces'}`);
    this.history.run(group);
    this.model.select(specs.map((spec) => group.push(addPiece(this.model, spec)).id));
  }

  duplicate() {
    this.copy();
    this.paste();
  }

  // --- pointer --------------------------------------------------------------

  #bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return; // the camera owns touch drags
      if (this.#move) return this.#updateMove(event);
      const proposal = this.tool === TOOLS.PLACE
        ? this.placement.update(event, this.#paint ? this.#paintedIds : null)
        : null;
      this.#lastCell = proposal
        ? { x: proposal.piece.x, y: proposal.piece.y }
        : this.placement.targetCell(event);
      if (this.#paint) this.#paintHere();
      this.#status(proposal?.message ?? null);
    });

    canvas.addEventListener('pointerleave', () => {
      if (this.#paint || this.#move) return;
      this.placement.clear();
      this.#status();
    });

    canvas.addEventListener('pointerdown', (event) => {
      this.#pointers.add(event.pointerId);
      if (event.button !== 0) return;

      // A touch drag belongs to the camera, so the tool waits for the release
      // and only acts if the finger stayed put. A mouse acts immediately.
      if (event.pointerType === 'touch') {
        this.#down = { x: event.clientX, y: event.clientY, touch: true, event };
        return;
      }

      // Capture can be refused if the pointer was released between events.
      try { canvas.setPointerCapture(event.pointerId); } catch { /* drag still works */ }
      this.#down = { x: event.clientX, y: event.clientY };

      if (this.tool === TOOLS.PLACE) {
        this.#painted.clear();
        this.#paintedIds.clear();
        this.placement.update(event);
        this.#paint = composite('Place elements');
        this.history.run(this.#paint);
        this.#paintHere();
      } else if (this.tool === TOOLS.ERASE) {
        this.#paint = composite('Erase elements');
        this.history.run(this.#paint);
        this.#eraseAt(event);
      } else {
        this.#startSelect(event);
      }
    });

    const finish = (event) => {
      if (event) this.#pointers.delete(event.pointerId);

      if (event && this.#down?.touch) {
        const still = Math.hypot(event.clientX - this.#down.x, event.clientY - this.#down.y) < 8;
        const alone = this.#pointers.size === 0;
        this.#down = null;
        if (still && alone) this.#tap(event);
        return;
      }

      if (this.#move) this.#commitMove();
      this.#paint = null;
      this.#down = null;
      this.movePreview.clear();
      this.view.invalidate();
      if (event && this.tool === TOOLS.PLACE) this.placement.update(event);
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => finish(null));
  }

  /**
   * One piece per column per drag.
   *
   * The guard is the column, not the landing height. Height rises as soon as a
   * piece lands, so keying on it would let a cursor that never moved keep
   * stacking a tower on top of its own last placement.
   */
  /** A single touch action: place one, erase one, or select one. */
  #tap(event) {
    if (this.tool === TOOLS.PLACE) {
      this.placement.update(event);
      this.#painted.clear();
      this.#paintedIds.clear();
      this.#paint = composite('Place element');
      this.history.run(this.#paint);
      this.#paintHere();
      this.#paint = null;
      this.placement.clear();
    } else if (this.tool === TOOLS.ERASE) {
      const id = this.#pieceAt(event);
      if (id) this.history.run(deletePieces(this.model, [id]));
    } else {
      const id = this.#pieceAt(event);
      if (id) this.model.select(id, { additive: event.shiftKey });
      else this.model.clearSelection();
    }
  }

  #paintHere() {
    const proposal = this.placement.proposal;
    if (!proposal?.valid) return;
    const { piece } = proposal;
    const column = `${piece.x}:${piece.y}`;
    if (this.#painted.has(column)) return;
    this.#painted.add(column);
    const { id, ...spec } = piece;
    this.#paintedIds.add(this.#paint.push(addPiece(this.model, spec)).id);
  }

  #eraseAt(event) {
    const id = this.#pieceAt(event);
    if (id) this.#paint.push(deletePieces(this.model, [id]));
  }

  // --- selection and moving -------------------------------------------------

  #pieceAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.view.camera);
    for (const hit of raycaster.intersectObjects(this.view.pieces.children, true)) {
      if (hit.object === this.sync.edges) continue;
      const id = this.sync.pieceIdFromHit(hit);
      if (id) return id;
    }
    return null;
  }

  #startSelect(event) {
    const id = this.#pieceAt(event);
    if (!id) {
      if (!event.shiftKey) this.model.clearSelection();
      return;
    }
    if (!this.model.selection.has(id)) this.model.select(id, { additive: event.shiftKey });

    // Drag horizontally on a plane through the selection's base, which is far
    // steadier than raycasting geometry that is moving with the cursor.
    const box = boundsOfPieces(this.model, [...this.model.selection]);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -box.z0);
    const start = this.#planePoint(event, plane);
    if (!start) return;
    this.#move = {
      plane,
      start,
      ids: [...this.model.selection],
      delta: { dx: 0, dy: 0 },
      valid: true
    };
  }

  #planePoint(event, plane) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.view.camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  #updateMove(event) {
    const point = this.#planePoint(event, this.#move.plane);
    if (!point) return;
    const dx = Math.round(point.x - this.#move.start.x);
    const dy = Math.round(point.z - this.#move.start.z);
    if (dx === this.#move.delta.dx && dy === this.#move.delta.dy) return;

    const result = (dx || dy)
      ? canMove(this.model, this.#move.ids, { dx, dy })
      : { ok: true, reasons: [] };
    this.#move.delta = { dx, dy };
    this.#move.valid = result.ok;
    this.#drawMovePreview();
    this.#status(result.ok ? null : result.reasons.map((r) => REASON_TEXT[r]).join(' · '));
  }

  #drawMovePreview() {
    this.movePreview.clear();
    const { ids, delta, valid } = this.#move;
    if (!delta.dx && !delta.dy) return this.view.invalidate();

    this.previewMaterial ??= {
      ok: new THREE.LineBasicMaterial({ color: 0xd98324 }),
      bad: new THREE.LineBasicMaterial({ color: 0xe5706a })
    };
    for (const id of ids) {
      const piece = this.model.piece(id);
      if (!piece) continue;
      const b = boundsOf(piece, this.model.elementOf(piece));
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d)),
        valid ? this.previewMaterial.ok : this.previewMaterial.bad
      );
      outline.position.set(
        b.x0 + delta.dx + b.w / 2,
        b.z0 + b.h / 2,
        b.y0 + delta.dy + b.d / 2
      );
      this.movePreview.add(outline);
    }
    this.view.invalidate();
  }

  #commitMove() {
    const { ids, delta, valid } = this.#move;
    this.#move = null;
    if (!valid || (!delta.dx && !delta.dy)) return;
    this.history.run(movePieces(this.model, ids.map((id) => {
      const piece = this.model.piece(id);
      return { id, x: piece.x + delta.dx, y: piece.y + delta.dy, z: piece.z };
    })));
  }

  // --- keyboard -------------------------------------------------------------

  #bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === 'c') { event.preventDefault(); this.copy(); }
        else if (key === 'v') { event.preventDefault(); this.paste(); }
        else if (key === 'd') { event.preventDefault(); this.duplicate(); }
        return;
      }

      switch (event.key) {
        case 'v': case 'V': this.setTool(TOOLS.SELECT); break;
        case 'b': case 'B': this.setTool(TOOLS.PLACE); break;
        case 'e': case 'E': this.setTool(TOOLS.ERASE); break;
        case 'r': case 'R': this.rotate(); break;
        case 'Escape': this.model.clearSelection(); break;
        case 'Delete': case 'Backspace':
          event.preventDefault();
          this.deleteSelection();
          break;
        default: break;
      }
    });
  }

  #refresh() {
    this.view.invalidate();
  }

  #status(message = null) {
    const piece = this.placement.proposal?.piece;
    this.onStatus?.({
      cell: this.#lastCell,
      z: this.tool === TOOLS.PLACE ? piece?.z ?? null : null,
      message,
      tool: this.tool
    });
  }
}
