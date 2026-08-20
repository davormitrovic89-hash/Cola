import * as THREE from 'three';
import { createStudioEnvironment } from '../three/studio-env.js';
import { createHandMesh } from './hand-mesh.js';

/**
 * WebGL-Szene der Hand, die aus dem Loch greift.
 *
 * Der Canvas liegt mit Alphakanal ueber dem CSS-Loch und zeichnet nur die
 * Hand selbst. Zwei Kniffe verkaufen die Tiefe:
 *
 *   1. Nebel. Der Unterarm laeuft nach hinten ins Schwarz aus, statt an
 *      einer sichtbaren Kante zu enden. Dadurch scheint er im Loch zu
 *      verschwinden, obwohl WebGL gar nichts vom Loch weiss.
 *   2. Ein Schattenfaenger mit kreisrunder Aussparung. Er ist unsichtbar
 *      und faengt nur den Schatten der Hand auf, der so auf dem CSS-Rand
 *      des Lochs landet.
 */

const HOLE_RADIUS = 0.85;

export function createThreeHandRenderer({ maxPixelRatio = 2 } = {}) {
  let host = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let hand = null;
  let armature = null;
  let envMap = null;
  let resizeObserver = null;
  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };

  /** Unsichtbare Flaeche mit rundem Loch, die nur Schatten zeigt. */
  function buildShadowCatcher() {
    const outer = new THREE.Shape();
    outer.moveTo(-4, -4);
    outer.lineTo(4, -4);
    outer.lineTo(4, 4);
    outer.lineTo(-4, 4);
    outer.closePath();

    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_RADIUS, 0, Math.PI * 2, true);
    outer.holes.push(hole);

    const mesh = new THREE.Mesh(
      track(new THREE.ShapeGeometry(outer)),
      track(new THREE.ShadowMaterial({ opacity: 0.5 }))
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildLights() {
    const group = new THREE.Group();

    const key = new THREE.DirectionalLight(0xfff1e4, 3.6);
    key.position.set(-2.2, 2.6, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.02;
    group.add(key, key.target);

    // kaltes Gegenlicht zeichnet die Fingerkanten gegen das schwarze Loch
    const rim = new THREE.DirectionalLight(0x7fa9ff, 1.6);
    rim.position.set(2.6, -0.4, -1.4);
    group.add(rim);

    // Fuelllicht aus Kamerarichtung: sonst liegt der Handruecken, der
    // dem Betrachter zugewandt ist, komplett im Schatten.
    const fill = new THREE.DirectionalLight(0xffe9d8, 1.8);
    fill.position.set(0.4, 0.6, 4.2);
    group.add(fill);

    group.add(new THREE.AmbientLight(0x40331f, 0.6));
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
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block;';
      host.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      // Nebel statt harter Kante: der Unterarm verliert sich im Schwarz
      // des Lochs, wo die Geometrie einfach aufhoert.
      scene.fog = new THREE.Fog(0x000000, 2.7, 4.6);

      envMap = createStudioEnvironment(renderer);
      scene.environment = envMap;
      scene.environmentIntensity = 0.45;

      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      camera.position.set(0, 0, 3.2);
      camera.lookAt(0, 0, 0);

      scene.add(buildShadowCatcher(), buildLights());

      hand = createHandMesh();
      disposables.push(hand);

      // armature traegt Ausrichtung und Position, hand.group nur das Modell
      armature = new THREE.Group();
      armature.add(hand.group);
      hand.group.position.y = -0.28;
      armature.scale.setScalar(0.8);
      scene.add(armature);

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

    /**
     * yaw / pitch in Radiant (Blickrichtung der Hand),
     * grab 0..1 (offen bis zugreifend),
     * reach 0..1 (wie weit die Hand aus dem Loch herauskommt).
     */
    setPose({ yaw = 0, pitch = 0, grab = 0, reach = 1 }) {
      if (!renderer) return;

      // Die Hand zeigt im Modell nach oben. Diese Grunddrehung kippt sie
      // zur Kamera, sodass die Finger den Betrachter ansehen.
      // Flache Neigung mit Absicht: kippt man die Hand staerker zur
      // Kamera, schaut man nur noch auf die Fingerkuppen, die Finger
      // verkuerzen sich zu Stummeln und die Hand liest sich als Faust.
      armature.rotation.set(0.44 + pitch, yaw, 0);
      armature.position.set(yaw * 0.3, -0.2 + pitch * 0.25, -0.9 + reach * 0.75);
      hand.setGrab(grab);

      renderer.render(scene, camera);
    },

    dispose() {
      resizeObserver?.disconnect();
      for (const d of disposables) d.dispose();
      envMap?.dispose();
      renderer?.domElement.remove();
      renderer?.dispose();
      host = renderer = scene = camera = hand = armature = envMap = null;
      disposables.length = 0;
    },
  };
}
