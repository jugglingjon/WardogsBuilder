/**
 * Model to scene, as deltas.
 *
 * Pieces of the same element type share one InstancedMesh per part of their
 * shape, so draw calls track parts per element type rather than the size of the
 * build. A thousand Hesco blocks cost one draw call; a thousand hollow
 * cylinders cost four, one for each piece of the tube.
 *
 * Every piece holds the same instance slot in each of its type's meshes.
 * Removing one swaps the last slot into the hole rather than rebuilding, so an
 * erase is constant time.
 */
import * as THREE from 'three';
import { boundsOf, pieceCenterWorld } from '../model/geometry.js';

const START_CAPACITY = 64;

/** Edges are drawn as one merged line set, and dropped once they stop reading. */
const EDGE_LIMIT = 2500;

/**
 * An InstancedMesh caches the bounding volume it raycasts against, and never
 * notices that its instances moved. Every write has to invalidate it or the
 * cursor starts missing pieces that are plainly under it.
 */
function invalidateBounds(mesh) {
  mesh.boundingSphere = null;
  mesh.boundingBox = null;
}

export class SceneSync {
  #blocks = new Map();  // pieceId -> { type, block }
  #types = new Map();   // elementId -> instanced record
  #edgeFrame = null;

  constructor({ model, view, factory }) {
    this.model = model;
    this.view = view;
    this.factory = factory;

    this.edges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    this.edges.frustumCulled = false;
    // Lines raycast with a one metre threshold, which would put a fuzzy halo
    // around every piece and make the cursor target things it is not over.
    this.edges.raycast = () => {};
    view.pieces.add(this.edges);

    model.on('piece:add', (piece) => { this.#add(piece); this.#scheduleEdges(); });
    model.on('piece:remove', (piece) => { this.#remove(piece.id); this.#scheduleEdges(); });
    model.on('piece:update', (piece) => { this.#write(piece); this.#scheduleEdges(); });
    model.on('selection:change', () => this.#syncSelection());
    model.on('reset', () => this.rebuild());

    this.rebuild();
  }

  // --- instanced meshes ------------------------------------------------------

  #typeRecord(elementId) {
    if (this.#types.has(elementId)) return this.#types.get(elementId);
    const { material, parts } = this.factory.typeOf(elementId);

    // Each part's transform inside the piece, baked once.
    const locals = parts.map((p) => new THREE.Matrix4().makeTranslation(...p.position));
    const record = { material, parts, locals, ids: [], capacity: 0, meshes: [] };
    this.#types.set(elementId, record);
    this.#grow(record, START_CAPACITY);
    return record;
  }

  /** Capacity doubles rather than reallocating per piece. */
  #grow(record, slots) {
    const previous = record.meshes;
    record.meshes = record.parts.map((part, i) => {
      const mesh = new THREE.InstancedMesh(part.geometry, record.material, slots);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = record.ids.length;

      const old = previous[i];
      if (old) {
        mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, mesh.count * 16));
        old.removeFromParent();
        old.dispose();
      }
      mesh.instanceMatrix.needsUpdate = true;
      invalidateBounds(mesh);
      this.view.pieces.add(mesh);
      return mesh;
    });
    record.capacity = slots;
  }

  #add(piece) {
    const record = this.#typeRecord(piece.type);
    if (record.ids.length >= record.capacity) this.#grow(record, record.capacity * 2);
    const block = record.ids.length;
    record.ids.push(piece.id);
    for (const mesh of record.meshes) {
      mesh.count = record.ids.length;
      invalidateBounds(mesh);
    }
    this.#blocks.set(piece.id, { type: piece.type, block });
    this.#write(piece);
  }

  #remove(id) {
    const slot = this.#blocks.get(id);
    if (!slot) return;
    const record = this.#types.get(slot.type);
    const last = record.ids.length - 1;

    if (slot.block !== last) {
      // Move the last piece into the hole so the instances stay contiguous.
      const movedId = record.ids[last];
      record.ids[slot.block] = movedId;
      this.#blocks.set(movedId, { type: slot.type, block: slot.block });
      const moved = this.model.piece(movedId);
      if (moved) this.#write(moved, record, slot.block);
    }
    record.ids.pop();
    for (const mesh of record.meshes) {
      mesh.count = record.ids.length;
      mesh.instanceMatrix.needsUpdate = true;
      invalidateBounds(mesh);
    }
    this.#blocks.delete(id);
    this.view.invalidate();
  }

  #write(piece, record = null, block = null) {
    const slot = this.#blocks.get(piece.id);
    if (!slot && block === null) return;
    const target = record ?? this.#types.get(slot.type);
    const at = block ?? slot.block;

    const element = this.model.elementOf(piece);
    const centre = pieceCenterWorld(piece, element);
    const pieceMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(centre.x, centre.y, centre.z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(piece.rot)
      ),
      new THREE.Vector3(1, 1, 1)
    );

    const matrix = new THREE.Matrix4();
    target.meshes.forEach((mesh, i) => {
      matrix.multiplyMatrices(pieceMatrix, target.locals[i]);
      mesh.setMatrixAt(at, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      invalidateBounds(mesh);
    });
    this.view.invalidate();
  }

  // --- lookups ---------------------------------------------------------------

  /** The piece an intersection landed on, instanced or not. */
  pieceIdFromHit(hit) {
    if (!hit || hit.object === this.edges) return null;
    for (const record of this.#types.values()) {
      if (!record.meshes.includes(hit.object)) continue;
      return record.ids[hit.instanceId] ?? null;
    }
    return hit.object.userData.pieceId ?? null;
  }

  /** Everything the camera should frame, measured from the model. */
  bounds() {
    const box = new THREE.Box3();
    for (const piece of this.model.pieces()) {
      const b = boundsOf(piece, this.model.elementOf(piece));
      box.expandByPoint(new THREE.Vector3(b.x0, b.z0, b.y0));
      box.expandByPoint(new THREE.Vector3(b.x1, b.z1, b.y1));
    }
    return box;
  }

  // --- edges and selection ---------------------------------------------------

  #scheduleEdges() {
    if (this.#edgeFrame) return;
    this.#edgeFrame = requestAnimationFrame(() => {
      this.#edgeFrame = null;
      this.#buildEdges();
    });
  }

  /**
   * One line set for every piece outline. Rebuilt from the model rather than
   * patched, which is cheap enough at the scale where the lines still read, and
   * dropped entirely beyond it.
   */
  #buildEdges() {
    const pieces = this.model.pieces();
    if (pieces.length > EDGE_LIMIT) {
      this.edges.visible = false;
      this.view.invalidate();
      return;
    }
    this.edges.visible = true;

    const corners = [
      [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
      [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
    ];
    const pairs = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const positions = new Float32Array(pieces.length * pairs.length * 6);
    let at = 0;
    for (const piece of pieces) {
      const b = boundsOf(piece, this.model.elementOf(piece));
      const point = (corner) => [
        corner[0] ? b.x1 : b.x0,
        corner[1] ? b.z1 : b.z0,
        corner[2] ? b.y1 : b.y0
      ];
      for (const [a, c] of pairs) {
        positions.set(point(corners[a]), at); at += 3;
        positions.set(point(corners[c]), at); at += 3;
      }
    }

    this.edges.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.edges.geometry = geometry;
    this.view.invalidate();
  }

  #syncSelection() {
    const group = this.view.selection;
    for (const child of [...group.children]) {
      child.removeFromParent();
      child.geometry?.dispose();
    }
    this.selectionMaterial ??= new THREE.LineBasicMaterial({
      color: getComputedStyle(document.documentElement)
        .getPropertyValue('--c-accent').trim() || '#d98324'
    });

    for (const id of this.model.selection) {
      const piece = this.model.piece(id);
      if (!piece) continue;
      const b = boundsOf(piece, this.model.elementOf(piece));
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.12, b.h + 0.12, b.d + 0.12)),
        this.selectionMaterial
      );
      outline.position.set(b.x0 + b.w / 2, b.z0 + b.h / 2, b.y0 + b.d / 2);
      group.add(outline);
    }
    this.view.invalidate();
  }

  rebuild() {
    for (const record of this.#types.values()) {
      record.ids.length = 0;
      for (const mesh of record.meshes) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
        invalidateBounds(mesh);
      }
    }
    this.#blocks.clear();
    for (const piece of this.model.pieces()) this.#add(piece);
    this.#buildEdges();
    this.#syncSelection();
  }
}
