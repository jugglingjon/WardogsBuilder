/**
 * Element type to three.js object.
 *
 * Every element is a box of its declared dimensions, so this stays trivial:
 * one geometry and one material per element type, cached and shared across
 * every instance. A hundred Hesco blocks cost one geometry.
 *
 * Rotation is applied to the instance rather than baked into geometry, so the
 * four rotations of a piece all share the same cached template.
 */
import * as THREE from 'three';

const SEAM = 0.06; // metres of gap drawn between the parts of a composed element

export class MeshFactory {
  #templates = new Map();
  #geometries = new Set();
  #materials = new Set();

  constructor(catalog) {
    this.catalog = catalog;
  }

  /** A fresh object for a piece, cloned from the element's cached template. */
  create(piece) {
    const element = this.catalog.get(piece.type);
    const object = this.#template(element).clone();
    object.userData.pieceId = piece.id;
    for (const child of object.children) child.userData.pieceId = piece.id;
    return object;
  }

  #template(element) {
    if (this.#templates.has(element.id)) return this.#templates.get(element.id);

    const [w, d, h] = element.size;
    const group = new THREE.Group();
    const material = this.#material(element.color);

    if (element.composedOf) {
      // A Long Hesco Wall is four tall blocks, so it reads as four blocks.
      const { count, axis } = element.composedOf;
      const alongWidth = axis === 'width';
      const span = (alongWidth ? w : d) / count;
      const boxW = alongWidth ? span - SEAM : w;
      const boxD = alongWidth ? d : span - SEAM;
      const geometry = this.#box(boxW, h, boxD);
      for (let i = 0; i < count; i++) {
        const offset = -((alongWidth ? w : d) / 2) + span * (i + 0.5);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(alongWidth ? offset : 0, 0, alongWidth ? 0 : offset);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        group.add(this.#edges(geometry, mesh.position));
      }
    } else {
      const geometry = this.#box(w, h, d);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.add(this.#edges(geometry));
    }

    this.#templates.set(element.id, group);
    return group;
  }

  #box(w, h, d) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    this.#geometries.add(geometry);
    return geometry;
  }

  /** Edges make grey boxes legible against each other at any zoom. */
  #edges(geometry, position) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      this.#edgeMaterial()
    );
    if (position) edges.position.copy(position);
    return edges;
  }

  #material(color) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.82,
      metalness: 0.02
    });
    this.#materials.add(material);
    return material;
  }

  #edgeMaterial() {
    if (!this.edgeMaterial) {
      this.edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.28
      });
      this.#materials.add(this.edgeMaterial);
    }
    return this.edgeMaterial;
  }

  dispose() {
    for (const geometry of this.#geometries) geometry.dispose();
    for (const material of this.#materials) material.dispose();
    this.#templates.clear();
  }
}
