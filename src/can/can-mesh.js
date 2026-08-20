import * as THREE from 'three';

/**
 * Geometrie einer 330-ml-Getraenkedose, massstabsgetreu nachgebaut.
 * Eine Einheit entspricht 10 cm: 6,6 cm Durchmesser, 11,5 cm Hoehe.
 *
 * Die Dose besteht aus drei Teilen, weil sie unterschiedliche Materialien
 * und unterschiedliche UV-Anforderungen haben:
 *
 *   1. Boden  - eingewoelbte Kuppel mit Standring, blankes Aluminium
 *   2. Koerper- gerader Zylinder, traegt die Label-Textur
 *   3. Deckel - Schulterverjuengung, Hals, gerollter Rand und Deckelflaeche
 *
 * Wuerde man alles als ein einziges Lathe bauen, zoege sich die Label-
 * Textur ueber Boden und Deckel mit. Getrennte Teile geben saubere UVs.
 */

const RADIUS = 0.33;
const BODY_BOTTOM = 0.09;
const BODY_TOP = 0.9;

// Profil des Bodens: von der Mitte der Woelbung nach aussen zum Standring
// und von dort die Wand hinauf bis zum vollen Durchmesser.
const BOTTOM_PROFILE = [
  [0.0, 0.07], [0.07, 0.067], [0.135, 0.06], [0.19, 0.048],
  [0.23, 0.033], [0.258, 0.019], [0.276, 0.008], [0.288, 0.002],
  [0.297, 0.0], [0.304, 0.005], [0.309, 0.015], [0.314, 0.032],
  [0.321, 0.056], [0.327, 0.076], [0.33, 0.09],
];

// Profil des Oberteils: Schulter, Hals, der nach aussen gerollte Rand
// und die leicht eingesenkte Deckelflaeche bis zur Mitte.
const TOP_PROFILE = [
  [0.33, 0.9], [0.33, 0.958], [0.327, 0.988], [0.319, 1.015],
  [0.305, 1.042], [0.286, 1.065], [0.263, 1.084], [0.238, 1.1],
  [0.219, 1.112], [0.209, 1.122], [0.206, 1.131], [0.209, 1.139],
  [0.213, 1.146], [0.21, 1.153], [0.202, 1.156], [0.194, 1.152],
  [0.19, 1.145], [0.188, 1.137], [0.187, 1.131], [0.16, 1.127],
  [0.1, 1.125], [0.0, 1.124],
];

const toPoints = (profile) => profile.map(([x, y]) => new THREE.Vector2(x, y));

/**
 * Baut die Dose. labelTexture ist die bereits geladene Label-Grafik.
 * Rueckgabe: { group, height, radius, dispose }.
 */
export function createCanMesh(labelTexture, { radialSegments = 128 } = {}) {
  const group = new THREE.Group();
  const disposables = [];

  const track = (obj) => {
    disposables.push(obj);
    return obj;
  };

  // --- Materialien ---------------------------------------------------
  // Blankes Aluminium: voll metallisch, leicht angerauht, damit die
  // Softboxen als weiche Streifen statt als harte Punkte erscheinen.
  const aluminium = track(new THREE.MeshStandardMaterial({
    color: 0xc7ccd2,
    metalness: 1.0,
    roughness: 0.24,
    envMapIntensity: 1.15,
  }));

  // Bedrucktes Aluminium: die Farbe kommt aus der Textur, das Metall
  // darunter sorgt nur noch fuer den Schimmer.
  const printed = track(new THREE.MeshStandardMaterial({
    map: labelTexture,
    metalness: 0.35,
    roughness: 0.3,
    envMapIntensity: 1.0,
  }));

  // --- Teile ---------------------------------------------------------
  const bottom = new THREE.Mesh(
    track(new THREE.LatheGeometry(toPoints(BOTTOM_PROFILE), radialSegments)),
    aluminium
  );

  const body = new THREE.Mesh(
    track(new THREE.CylinderGeometry(
      RADIUS, RADIUS, BODY_TOP - BODY_BOTTOM, radialSegments, 1, true
    )),
    printed
  );
  body.position.y = (BODY_BOTTOM + BODY_TOP) / 2;

  const top = new THREE.Mesh(
    track(new THREE.LatheGeometry(toPoints(TOP_PROFILE), radialSegments)),
    aluminium
  );

  // Lasche: ein flachgedrueckter Ring auf der Deckelflaeche plus der
  // kleine Niet in der Mitte, der ihn haelt.
  const tab = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.055, 0.011, 10, 32)),
    aluminium
  );
  tab.rotation.x = -Math.PI / 2;
  tab.scale.y = 0.45;
  tab.position.set(0.055, 1.131, 0);

  const rivet = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.016, 0.02, 0.014, 16)),
    aluminium
  );
  rivet.position.set(0, 1.13, 0);

  for (const mesh of [bottom, body, top, tab, rivet]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return {
    group,
    height: TOP_PROFILE[TOP_PROFILE.length - 1][1],
    radius: RADIUS,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
