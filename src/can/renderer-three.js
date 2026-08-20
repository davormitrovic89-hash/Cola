import * as THREE from 'three';
import { createStudioEnvironment } from '../three/studio-env.js';
import { createCanMesh } from './can-mesh.js';
import labelUrl from '../assets/can-label.png';

/**
 * WebGL-Renderer der Dose als anamorphes Billboard.
 *
 * Die Idee hinter der Illusion: Es gibt eine echte 3D-Box, die vorne offen
 * ist — das ist die "Werbetafel". Die Dose steht darin, aber so weit nach
 * vorne gekippt, dass ihre Oberseite die Oeffnung durchstoesst und vor dem
 * Rahmen liegt. Weil alles echte Geometrie mit Tiefentest ist, verdeckt die
 * Dose den Rahmen an dieser Stelle von selbst.
 *
 * Der zweite Teil des Tricks: Der Canvas hat einen Alphakanal und ausserhalb
 * des Rahmens wird nichts gezeichnet. Der Teil der Dose, der aus der Tafel
 * ragt, steht damit frei auf der Webseite. Ein Schattenfaenger rund um den
 * Rahmen faengt ihren Schlagschatten auf, sodass sie auch Schatten auf die
 * Seite selbst wirft.
 *
 * Erfuellt dasselbe Interface wie renderer-css.js:
 *   mount(host) / setRotation(degrees) / dispose()
 */

// Querformat wie eine echte Werbetafel. Die Dose ist mit 2,3 Einheiten
// bewusst hoeher als die Oeffnung — nur so bricht sie oben heraus.
const OPENING_W = 3.4;
const OPENING_H = 1.9;
const BOX_DEPTH = 1.5;
const BEZEL = 0.13;
const CAN_SCALE = 1.9;

export function createThreeCanRenderer({ maxPixelRatio = 2 } = {}) {
  let host = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let canSpin = null;
  let can = null;
  let envMap = null;
  let resizeObserver = null;
  const disposables = [];

  const track = (o) => {
    disposables.push(o);
    return o;
  };

  /** Die vorne offene Box — Rueckwand, Boden, Decke und Seitenwaende. */
  function buildBox() {
    const box = new THREE.Group();

    const wallMat = track(new THREE.MeshStandardMaterial({
      color: 0x0c0e12,
      roughness: 0.72,
      metalness: 0.1,
    }));
    // Der Boden der Box ist glatter, damit sich die Dose darin spiegelt.
    const floorMat = track(new THREE.MeshStandardMaterial({
      color: 0x090b0e,
      roughness: 0.2,
      metalness: 0.6,
      envMapIntensity: 1.2,
    }));

    const back = new THREE.Mesh(
      track(new THREE.PlaneGeometry(OPENING_W, OPENING_H)), wallMat
    );
    back.position.z = -BOX_DEPTH;

    const floor = new THREE.Mesh(
      track(new THREE.PlaneGeometry(OPENING_W, BOX_DEPTH)), floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -OPENING_H / 2, -BOX_DEPTH / 2);

    const ceiling = new THREE.Mesh(
      track(new THREE.PlaneGeometry(OPENING_W, BOX_DEPTH)), wallMat
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, OPENING_H / 2, -BOX_DEPTH / 2);

    const sideGeo = track(new THREE.PlaneGeometry(BOX_DEPTH, OPENING_H));
    const left = new THREE.Mesh(sideGeo, wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-OPENING_W / 2, 0, -BOX_DEPTH / 2);

    const right = new THREE.Mesh(sideGeo, wallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(OPENING_W / 2, 0, -BOX_DEPTH / 2);

    for (const wall of [back, floor, ceiling, left, right]) {
      wall.receiveShadow = true;
      box.add(wall);
    }
    return box;
  }

  /** Der Rahmen der Werbetafel, leicht vor der Oeffnung. */
  function buildBezel() {
    const bezel = new THREE.Group();
    const mat = track(new THREE.MeshStandardMaterial({
      color: 0x343a44,
      metalness: 0.9,
      roughness: 0.26,
    }));

    const horizontal = track(new THREE.BoxGeometry(OPENING_W + BEZEL * 2, BEZEL, 0.22));
    const vertical = track(new THREE.BoxGeometry(BEZEL, OPENING_H + BEZEL * 2, 0.22));

    const bars = [
      [horizontal, 0, OPENING_H / 2 + BEZEL / 2],
      [horizontal, 0, -OPENING_H / 2 - BEZEL / 2],
      [vertical, -OPENING_W / 2 - BEZEL / 2, 0],
      [vertical, OPENING_W / 2 + BEZEL / 2, 0],
    ];

    for (const [geo, x, y] of bars) {
      const bar = new THREE.Mesh(geo, mat);
      bar.position.set(x, y, 0.09);
      bar.castShadow = true;
      bar.receiveShadow = true;
      bezel.add(bar);
    }
    return bezel;
  }

  /**
   * Flaeche rund um den Rahmen, die nur Schatten sichtbar macht und sonst
   * durchsichtig bleibt. Dadurch faellt der Schatten der herausragenden
   * Dose scheinbar auf die Webseite.
   */
  function buildShadowCatcher() {
    const outer = new THREE.Shape();
    outer.moveTo(-7, -5);
    outer.lineTo(7, -5);
    outer.lineTo(7, 5);
    outer.lineTo(-7, 5);
    outer.closePath();

    const hw = OPENING_W / 2 + BEZEL;
    const hh = OPENING_H / 2 + BEZEL;
    const hole = new THREE.Path();
    hole.moveTo(-hw, -hh);
    hole.lineTo(-hw, hh);
    hole.lineTo(hw, hh);
    hole.lineTo(hw, -hh);
    hole.closePath();
    outer.holes.push(hole);

    const mesh = new THREE.Mesh(
      track(new THREE.ShapeGeometry(outer)),
      track(new THREE.ShadowMaterial({ opacity: 0.42 }))
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildLights() {
    const group = new THREE.Group();

    // Hauptlicht von vorne links oben, wirft die Schatten
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.2, 2.8, 4.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;
    group.add(key, key.target);

    // kuehles Gegenlicht, das die Silhouette der Dose nachzeichnet
    const rim = new THREE.DirectionalLight(0x9ec2ff, 1.5);
    rim.position.set(-3.2, 1.4, -1.6);
    group.add(rim);

    // Frontales Fuelllicht: ohne das saeuft das Label ab, weil das
    // Hauptlicht steil von oben kommt und die Vorderseite kaum trifft.
    const fill = new THREE.DirectionalLight(0xfff2ea, 1.5);
    fill.position.set(-0.6, 0.7, 5.5);
    group.add(fill);

    // roter Schein aus dem Inneren der Box — greift die Farbe der Dose auf
    const inner = new THREE.PointLight(0xff3348, 7, 7, 2);
    inner.position.set(0, -0.35, -1.1);
    group.add(inner);

    return group;
  }

  return {
    mount(hostEl) {
      host = hostEl;

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setClearAlpha(0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.28;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block;';
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      envMap = createStudioEnvironment(renderer);
      scene.environment = envMap;

      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0.35, 6.0);
      camera.lookAt(0, 0.1, 0);

      scene.add(buildBox(), buildBezel(), buildShadowCatcher(), buildLights());

      // Label laden und die Dose bauen
      const loader = new THREE.TextureLoader();
      const labelTexture = track(loader.load(labelUrl));
      labelTexture.colorSpace = THREE.SRGBColorSpace;
      labelTexture.wrapS = THREE.RepeatWrapping;
      labelTexture.offset.x = 0.5;
      labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      can = createCanMesh(labelTexture);
      disposables.push(can);

      // Die Dose kippt nach vorne aus der Oeffnung heraus. canSpin dreht
      // sie um ihre eigene Achse, der Pivot darueber setzt Neigung und Ort.
      canSpin = new THREE.Group();
      canSpin.add(can.group);

      // Der Pivot sitzt am Dosenboden, nicht in der Mitte. Dadurch bleibt
      // die Dose beim Kippen auf dem Boden der Box stehen und lehnt sich
      // nach vorne aus der Oeffnung heraus, statt in der Luft zu schweben.
      const pivot = new THREE.Group();
      pivot.add(canSpin);
      pivot.scale.setScalar(CAN_SCALE);
      pivot.position.set(-0.1, -OPENING_H / 2, -0.45);
      // Positives rotation.x kippt die Oberseite zur Kamera hin. Mit
      // negativem Wert lehnt sich die Dose in die Box hinein und ihre
      // Schulter verschwindet hinter der Rahmenleiste — genau das, was
      // die Illusion kaputt macht.
      pivot.rotation.set(0.42, 0, 0.09);
      scene.add(pivot);

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    },

    setRotation(degrees) {
      if (!renderer) return;
      canSpin.rotation.y = THREE.MathUtils.degToRad(degrees);
      renderer.render(scene, camera);
    },

    dispose() {
      resizeObserver?.disconnect();
      for (const d of disposables) d.dispose();
      envMap?.dispose();
      renderer?.domElement.remove();
      renderer?.dispose();
      host = renderer = scene = camera = canSpin = can = envMap = null;
      disposables.length = 0;
    },
  };
}
