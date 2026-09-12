/**
 * Element type to renderable parts.
 *
 * Every element is a box, so a type needs exactly one geometry and one
 * material, shared by every instance of it. A composed element such as the Long
 * Hesco Wall is a repeated part rather than one slab, so it reads as four blocks
 * and not as a wall-shaped lump.
 *
 * Nothing here creates scene objects. sync.js turns these parts into instanced
 * meshes, which is what keeps draw calls flat as a build grows.
 */
import * as THREE from 'three';

const SEAM = 0.06; // metres of gap between the parts of a composed element

/** A canvas-drawn surface, so the boxes read as materials rather than paint. */
function surfaceTexture(color, style) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  if (style === 'gabion') {
    // Hesco baskets are wire cages full of fill: a grid over a speckled ground.
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgb(0 0 0 / ${Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    ctx.strokeStyle = 'rgb(0 0 0 / 0.24)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const at = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(at, 0); ctx.lineTo(at, size);
      ctx.moveTo(0, at); ctx.lineTo(size, at);
      ctx.stroke();
    }
  } else if (style === 'concrete') {
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgb(255 255 255 / ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const STYLES = { fortification: 'gabion', command: 'concrete', defense: 'concrete' };

export class MeshFactory {
  #types = new Map();

  constructor(catalog) {
    this.catalog = catalog;
  }

  /**
   * The shared geometry, material and part offsets for an element type.
   * Parts are in the piece's own frame, before its rotation is applied.
   */
  typeOf(elementId) {
    if (this.#types.has(elementId)) return this.#types.get(elementId);
    const element = this.catalog.get(elementId);
    const [w, d, h] = element.size;

    let parts = [[0, 0, 0]];
    let boxW = w;
    let boxD = d;

    if (element.composedOf) {
      const { count, axis } = element.composedOf;
      const alongWidth = axis === 'width';
      const span = (alongWidth ? w : d) / count;
      boxW = alongWidth ? span - SEAM : w;
      boxD = alongWidth ? d : span - SEAM;
      parts = Array.from({ length: count }, (_, i) => {
        const offset = -((alongWidth ? w : d) / 2) + span * (i + 0.5);
        return alongWidth ? [offset, 0, 0] : [0, 0, offset];
      });
    }

    const record = {
      element,
      parts,
      geometry: new THREE.BoxGeometry(boxW, h, boxD),
      material: new THREE.MeshStandardMaterial({
        color: new THREE.Color(element.color),
        map: surfaceTexture(element.color, STYLES[element.category] ?? 'concrete'),
        roughness: 0.85,
        metalness: 0.02
      })
    };
    this.#types.set(elementId, record);
    return record;
  }

  dispose() {
    for (const record of this.#types.values()) {
      record.geometry.dispose();
      record.material.map?.dispose();
      record.material.dispose();
    }
    this.#types.clear();
  }
}
