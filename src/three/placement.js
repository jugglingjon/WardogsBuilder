/**
 * Where a piece would land if you clicked right now, and the ghost that shows
 * it.
 *
 * The rule is the one the model already enforces: the piece settles on the
 * highest surface under its footprint, or on the ground, and turns red when it
 * would not be fully supported or would clash with something. Nothing here
 * decides anything the validator does not.
 */
import * as THREE from 'three';
import { canPlace, restingZ, REASON_TEXT } from '../model/validate.js';
import { rotatedSize, pieceCenterWorld } from '../model/geometry.js';

function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export class Placement {
  #signature = null;
  #footprint = null;

  constructor({ model, view, sync }) {
    this.model = model;
    this.view = view;
    this.sync = sync;
    this.elementId = null;
    this.rotation = 0;
    this.proposal = null;

    this.group = new THREE.Group();
    this.group.visible = false;
    view.scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
  }

  setElement(id) {
    this.elementId = id;
    this.rotation = 0;
    this.#signature = null;
  }

  setRotation(rot) {
    this.rotation = rot;
  }

  clear() {
    this.proposal = null;
    this.group.visible = false;
    this.view.invalidate();
  }

  /**
   * The cell the cursor is pointing at.
   *
   * Hitting the top of something targets its own column, hitting a side targets
   * the column beside it. That is the rule every building game uses and it is
   * what lets you run a wall along the outside of another one.
   */
  targetCell(event, exclude = null) {
    const rect = this.view.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.view.camera);

    const targets = [...this.view.pieces.children];
    if (this.view.ground) targets.push(this.view.ground);

    // Walk the hits nearest first, skipping pieces painted during the current
    // drag. Without that each one becomes the next ray's target and a
    // stationary cursor walks a line of pieces sideways off its own last
    // placement.
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      if (hit.object === this.sync.edges) continue;
      const pieceId = this.sync.pieceIdFromHit(hit);
      if (pieceId && exclude?.has(pieceId)) continue;

      const point = hit.point.clone();
      if (hit.face) {
        const normal = hit.face.normal.clone();
        if (hit.instanceId != null) {
          // An instance carries its own rotation, which the object matrix alone
          // does not describe.
          const matrix = new THREE.Matrix4();
          hit.object.getMatrixAt(hit.instanceId, matrix);
          normal.transformDirection(matrix);
        }
        normal.transformDirection(hit.object.matrixWorld).multiplyScalar(0.5);
        point.add(normal);
      }
      return { x: Math.floor(point.x), y: Math.floor(point.z) };
    }
    return null;
  }

  /** Recompute the proposal for this pointer position and redraw the ghost. */
  update(event, exclude = null) {
    if (!this.elementId) return this.clear();
    const cell = event && this.targetCell(event, exclude);
    if (!cell) return this.clear();

    const element = this.model.catalog.get(this.elementId);
    const [w, d] = rotatedSize(element.size, this.rotation);
    const piece = {
      id: '__ghost__',
      type: this.elementId,
      rot: this.rotation,
      x: cell.x - Math.floor((w - 1) / 2),
      y: cell.y - Math.floor((d - 1) / 2),
      z: 0
    };
    piece.z = restingZ(this.model, piece);

    const result = canPlace(this.model, piece);
    this.proposal = {
      piece,
      valid: result.ok,
      reasons: result.reasons,
      message: result.ok ? null : result.reasons.map((r) => REASON_TEXT[r]).join(' · ')
    };
    this.#draw();
    return this.proposal;
  }

  #draw() {
    const { piece, valid } = this.proposal;
    const element = this.model.catalog.get(piece.type);
    const [w, d, h] = rotatedSize(element.size, piece.rot);
    const signature = `${piece.type}:${piece.rot}:${valid}`;

    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#rebuild(w, d, h, valid ? element.color : null);
    }

    const centre = pieceCenterWorld(piece, element);
    this.group.position.set(centre.x, centre.y, centre.z);
    this.#footprint.position.y = -h / 2 + 0.012; // sits on the landing surface
    this.group.visible = true;
    this.view.invalidate();
  }

  #rebuild(w, d, h, color) {
    for (const child of [...this.group.children]) {
      child.removeFromParent();
      child.geometry?.dispose();
    }
    const tint = color ? new THREE.Color(color) : themeColor('--c-danger', '#e5706a');

    const box = new THREE.BoxGeometry(w, h, d);
    this.group.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.42, depthWrite: false
    })));
    this.group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: tint })
    ));

    // The footprint on the landing surface, so the exact cells are never in
    // doubt at a grazing camera angle.
    const footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        color: tint, transparent: true, opacity: 0.5,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    footprint.rotation.x = -Math.PI / 2;
    this.group.add(footprint);
    this.#footprint = footprint;
  }
}
