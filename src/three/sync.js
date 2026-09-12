/**
 * Model events to scene graph deltas.
 *
 * The scene is never rebuilt on an edit. Each piece keeps one object, so moving
 * a piece mutates a transform and nothing else, which is what keeps dragging
 * smooth however large the build gets.
 */
import * as THREE from 'three';
import { pieceCenterWorld } from '../model/geometry.js';

export class SceneSync {
  #objects = new Map();

  constructor({ model, view, factory }) {
    this.model = model;
    this.view = view;
    this.factory = factory;

    model.on('piece:add', (piece) => this.#add(piece));
    model.on('piece:remove', (piece) => this.#remove(piece.id));
    model.on('piece:update', (piece) => this.#place(piece, this.#objects.get(piece.id)));
    model.on('selection:change', () => this.#syncSelection());
    model.on('reset', () => this.rebuild());

    this.rebuild();
  }

  objectFor(id) {
    return this.#objects.get(id) ?? null;
  }

  #add(piece) {
    const object = this.factory.create(piece);
    this.#place(piece, object);
    this.view.pieces.add(object);
    this.#objects.set(piece.id, object);
    this.view.invalidate();
  }

  #remove(id) {
    const object = this.#objects.get(id);
    if (!object) return;
    object.removeFromParent();
    this.#objects.delete(id);
    this.view.invalidate();
  }

  #place(piece, object) {
    if (!object) return;
    const element = this.model.elementOf(piece);
    const centre = pieceCenterWorld(piece, element);
    object.position.set(centre.x, centre.y, centre.z);
    object.rotation.y = -THREE.MathUtils.degToRad(piece.rot);
    this.view.invalidate();
  }

  /** Selection draws as an outline box, so shared materials stay untouched. */
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
      const object = this.#objects.get(id);
      if (!object) continue;
      const box = new THREE.Box3().setFromObject(object).expandByScalar(0.06);
      const size = box.getSize(new THREE.Vector3());
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
        this.selectionMaterial
      );
      outline.position.copy(box.getCenter(new THREE.Vector3()));
      group.add(outline);
    }
    this.view.invalidate();
  }

  rebuild() {
    for (const id of [...this.#objects.keys()]) this.#remove(id);
    for (const piece of this.model.pieces()) this.#add(piece);
    this.#syncSelection();
  }

  /** The bounding box of everything placed, used to frame the camera. */
  bounds() {
    const box = new THREE.Box3();
    for (const object of this.#objects.values()) box.expandByObject(object);
    return box;
  }
}
