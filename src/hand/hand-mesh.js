import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createSkinTextures } from './skin-texture.js';

/**
 * Eine posierbare 3D-Hand aus Grundkoerpern.
 *
 * Aufbau wie ein Skelett: Jeder Finger ist eine Kette aus drei Gliedern,
 * jedes Glied haengt in einer eigenen Gruppe an der Spitze des vorherigen.
 * Dreht man diese Gruppen um ihre lokale X-Achse, krallt sich der Finger
 * genau wie ein echter — die Glieder folgen automatisch, weil sie
 * aneinanderhaengen.
 *
 * Masse in Einheiten zu 10 cm, also ungefaehr eine erwachsene Hand.
 */

// [Abstand von der Handmitte, Laenge der drei Glieder, Grundradius, Spreizung]
const FINGERS = [
  { x: -0.26, lengths: [0.40, 0.27, 0.21], radius: 0.072, spread: -0.26 },
  { x: -0.09, lengths: [0.44, 0.29, 0.22], radius: 0.076, spread: -0.08 },
  { x: 0.09, lengths: [0.41, 0.27, 0.20], radius: 0.071, spread: 0.11 },
  { x: 0.25, lengths: [0.32, 0.21, 0.17], radius: 0.060, spread: 0.32 },
];

// Wie stark sich die einzelnen Glieder beim Zugreifen beugen. Das
// Mittelglied beugt am staerksten — daher wirkt eine Faust rund.
const CURL_WEIGHTS = [0.85, 1.15, 0.9];

// Grundkruemmung der Glieder in Ruhe — ohne sie wirkt die offene Hand
// wie ein Brett.
const REST_CURL = [0.04, 0.09, 0.13];

function buildChain(material, lengths, radius, taper = 0.10) {
  const root = new THREE.Group();
  const joints = [];
  const geometries = [];
  let attach = root;

  lengths.forEach((len, i) => {
    const joint = new THREE.Group();
    attach.add(joint);
    joints.push(joint);

    const r = radius * (1 - taper * i);
    const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.02), 6, 20);
    geometries.push(geo);

    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = len / 2;
    mesh.castShadow = true;
    joint.add(mesh);

    const next = new THREE.Group();
    next.position.y = len - r * 1.0;
    joint.add(next);
    attach = next;
  });

  return { root, joints, geometries };
}

export function createHandMesh() {
  const group = new THREE.Group();
  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };

  // Haut: matt, leicht durchscheinend wirkend durch den warmen Sheen.
  // Ohne Sheen sieht Haut in WebGL schnell nach Plastik aus.
  const { map, roughnessMap } = createSkinTextures();
  track(map);
  track(roughnessMap);

  const skin = track(new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap,
    color: 0xffffff,
    roughness: 0.56,
    metalness: 0.0,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xff8f6a),
    clearcoat: 0.22,
    clearcoatRoughness: 0.7,
  }));

  // --- Handflaeche ----------------------------------------------------
  const palm = new THREE.Mesh(
    track(new RoundedBoxGeometry(0.78, 0.84, 0.26, 6, 0.17)),
    skin
  );
  palm.position.y = 0.05;
  palm.castShadow = true;
  group.add(palm);

  // Der Handruecken ist zur Handkante hin schmaler — ein zweiter,
  // schmalerer Block darunter rundet die Silhouette ab.
  const heel = new THREE.Mesh(
    track(new RoundedBoxGeometry(0.62, 0.44, 0.26, 6, 0.16)),
    skin
  );
  heel.position.set(-0.02, -0.34, 0);
  heel.castShadow = true;
  group.add(heel);

  // --- Finger ---------------------------------------------------------
  const fingers = FINGERS.map(({ x, lengths, radius, spread }) => {
    const chain = buildChain(skin, lengths, radius);
    chain.geometries.forEach(track);
    chain.root.position.set(x, 0.44, 0);
    chain.root.rotation.z = spread;
    group.add(chain.root);
    return chain;
  });

  // --- Daumen ---------------------------------------------------------
  // Sitzt tief an der Handkante und zeigt quer zur Handflaeche.
  const thumb = buildChain(skin, [0.28, 0.21], 0.088, 0.06);
  thumb.geometries.forEach(track);
  thumb.root.position.set(-0.31, -0.02, 0.05);
  thumb.root.rotation.set(0.42, 0.18, 0.92);
  group.add(thumb.root);

  // --- Unterarm -------------------------------------------------------
  // Verschwindet nach hinten im Dunkeln, damit die Hand nicht frei
  // schwebt, sondern aus dem Loch zu kommen scheint.
  const forearm = new THREE.Mesh(
    track(new THREE.CapsuleGeometry(0.215, 1.7, 6, 24)),
    skin
  );
  forearm.position.set(0, -1.28, -0.02);
  forearm.castShadow = true;
  group.add(forearm);

  /**
   * grab: 0 = Hand offen und gespreizt, 1 = zugreifend gekruemmt.
   */
  function setGrab(grab) {
    const t = Math.max(0, Math.min(1, grab));
    fingers.forEach((finger, i) => {
      // Die aeusseren Finger schliessen minimal frueher — das nimmt der
      // Bewegung das Mechanische.
      const lead = 1 + (i === 3 ? 0.18 : i === 0 ? 0.08 : 0);
      finger.joints.forEach((joint, j) => {
        joint.rotation.x = REST_CURL[j] + t * CURL_WEIGHTS[j] * lead * 0.6;
      });
    });
    thumb.joints.forEach((joint, j) => {
      joint.rotation.x = 0.12 + t * (j === 0 ? 0.5 : 0.75);
    });
  }

  setGrab(0);

  return {
    group,
    setGrab,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
