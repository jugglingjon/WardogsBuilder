/**
 * The view pane: a three.js scene with an orbit camera.
 *
 * Renders on demand rather than on a permanent loop. The loop only spins while
 * the orbit controls are still settling, so an idle tool costs nothing.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildArea } from '../model/validate.js';

function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export class SceneView {
  #dirty = true;
  #spinning = false;
  #area = null;

  constructor(canvas, { model }) {
    this.canvas = canvas;
    this.model = model;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = themeColor('--c-bg', '#0e1013');

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
    this.camera.position.set(28, 22, 34);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // never drop below ground
    this.controls.minDistance = 3;
    this.controls.maxDistance = 400;
    this.controls.addEventListener('start', () => { this.#spinning = true; });
    this.controls.addEventListener('end', () => { this.#spinning = false; this.invalidate(); });
    this.controls.addEventListener('change', () => this.invalidate());

    this.#addLights();
    this.pieces = new THREE.Group();
    this.scene.add(this.pieces);
    this.selection = new THREE.Group();
    this.scene.add(this.selection);
    this.#buildGround();

    model.on('change', () => this.#syncGround());
    model.on('reset', () => this.#syncGround());

    this.#loop();
  }

  #addLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x3a4149, 1.15));
    const sun = new THREE.DirectionalLight(0xfff4e2, 1.7);
    sun.position.set(38, 54, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const extent = 70;
    Object.assign(sun.shadow.camera, {
      left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 220
    });
    this.sun = sun;
    this.scene.add(sun);
  }

  /** Ground and grid follow the buildable area, so both panes show one site. */
  #buildGround() {
    const area = buildArea(this.model);
    this.#area = area;
    const width = area.x1 - area.x0;
    const depth = area.y1 - area.y0;

    this.ground?.geometry.dispose();
    this.ground?.removeFromParent();
    this.grid?.removeFromParent();
    this.grid?.geometry.dispose();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      this.groundMaterial ??= new THREE.MeshStandardMaterial({
        color: themeColor('--c-grid-ground', '#191d22'),
        roughness: 1
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(area.x0 + width / 2, 0, area.y0 + depth / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.max(width, depth),
      themeColor('--c-grid-line-major', '#333b45'),
      themeColor('--c-grid-line', '#262c34')
    );
    grid.position.set(area.x0 + width / 2, 0.01, area.y0 + depth / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.8;
    this.scene.add(grid);
    this.grid = grid;

    this.sun.target.position.set(ground.position.x, 0, ground.position.z);
    this.sun.target.updateMatrixWorld();
    this.invalidate();
  }

  #syncGround() {
    const area = buildArea(this.model);
    const same = this.#area &&
      area.x0 === this.#area.x0 && area.y0 === this.#area.y0 &&
      area.x1 === this.#area.x1 && area.y1 === this.#area.y1;
    if (!same) this.#buildGround();
  }

  resize(width, height) {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate() {
    this.#dirty = true;
  }

  #loop() {
    requestAnimationFrame(() => this.#loop());
    const moved = this.controls.update();
    if (!moved && !this.#dirty && !this.#spinning) return;
    this.#dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  /** Frame the build, or the site when nothing is placed yet. */
  frame(box) {
    const target = box ?? new THREE.Box3(
      new THREE.Vector3(this.#area.x0, 0, this.#area.y0),
      new THREE.Vector3(this.#area.x1, 4, this.#area.y1)
    );
    if (target.isEmpty()) return;

    const centre = target.getCenter(new THREE.Vector3());
    const size = target.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 3);

    // Fit against whichever field of view is tighter, so a wide build is not
    // clipped by the sides of a narrow pane.
    const vertical = (this.camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.1;

    const direction = new THREE.Vector3(0.72, 0.62, 0.92).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.controls.target.copy(centre);
    this.controls.update();
    this.invalidate();
  }

  /** Preset viewpoints, useful for comparing plans and taking screenshots. */
  view(preset) {
    const centre = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(centre);
    const directions = {
      top: new THREE.Vector3(0.001, 1, 0.001),
      front: new THREE.Vector3(0, 0.22, 1),
      corner: new THREE.Vector3(0.72, 0.62, 0.92)
    };
    const direction = (directions[preset] ?? directions.corner).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, distance);
    this.controls.update();
    this.invalidate();
  }
}
