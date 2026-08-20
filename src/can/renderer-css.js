import labelUrl from '../assets/can-label.png';

/**
 * CSS-3D-Renderer fuer die Dose.
 *
 * Baut einen Zylinder aus vielen schmalen, rotierten <div>-Segmenten, die
 * gemeinsam die Label-Textur zeigen, plus zwei metallische Deckel.
 *
 * Erfuellt das gemeinsame Can-Renderer-Interface:
 *   mount(host)          - haengt die Geometrie in host ein
 *   setRotation(degrees) - dreht die Dose um die Y-Achse
 *   dispose()            - raeumt alles wieder ab
 *
 * Ein alternativer WebGL-Renderer (Three.js) kann spaeter dasselbe
 * Interface implementieren und hier ausgetauscht werden, ohne dass der
 * Controller in can.js sich aendert.
 */
export function createCssCanRenderer({
  segments = 56,
  radius = 108,
  height = 300,
  lightDeg = -35,
} = {}) {
  const angleStep = 360 / segments;
  // Sehnenbreite, damit die Segmente rundum kantenbuendig kacheln
  const segWidth = 2 * radius * Math.tan((angleStep * Math.PI) / 360) * 1.01;
  const wrapWidth = segments * segWidth;

  let group = null;
  let segs = [];

  function buildSegments() {
    for (let i = 0; i < segments; i++) {
      const seg = document.createElement('div');
      seg.className = 'can-seg';
      seg.style.width = segWidth + 'px';
      seg.style.height = height + 'px';
      seg.style.marginLeft = -(segWidth / 2) + 'px';
      seg.style.backgroundImage = `url(${labelUrl})`;
      seg.style.backgroundSize = wrapWidth + 'px ' + height + 'px';
      seg.style.backgroundPositionX = -(i * segWidth) + 'px';

      const baseAngle = i * angleStep;
      seg.dataset.angle = baseAngle;
      seg.style.transform = `rotateY(${baseAngle}deg) translateZ(${radius}px)`;

      group.appendChild(seg);
      segs.push(seg);
    }
  }

  function buildCap(topOffset) {
    const cap = document.createElement('div');
    cap.className = 'can-cap';
    cap.style.width = radius * 2 + 'px';
    cap.style.height = radius * 2 + 'px';
    cap.style.top = topOffset + 'px';
    cap.style.marginLeft = -radius + 'px';
    cap.style.marginTop = -radius + 'px';
    cap.style.transform = 'rotateX(90deg)';
    group.appendChild(cap);
  }

  /**
   * Beleuchtung: das Licht kommt von schraeg oben rechts. Jedes Segment
   * wird nach seinem Winkel relativ zur aktuellen Drehung abgeschattet,
   * damit die Dose beim Drehen plastisch wirkt.
   */
  function updateLighting(rotationY) {
    const lightRad = (lightDeg * Math.PI) / 180;
    for (const seg of segs) {
      const worldAngle = (parseFloat(seg.dataset.angle) + rotationY) % 360;
      const rad = (worldAngle * Math.PI) / 180;
      // facing: 1 = zur Kamera/zum Licht, -1 = weg davon
      const facing = Math.cos(rad - lightRad);
      const brightness = 0.55 + Math.max(0, facing) * 0.85;
      const darken = facing < 0 ? Math.min(0.55, -facing * 0.55) : 0;
      seg.style.filter =
        `brightness(${brightness.toFixed(2)}) saturate(${(1.1 - darken).toFixed(2)})`;
    }
  }

  return {
    mount(host) {
      group = document.createElement('div');
      group.id = 'can-group';
      group.style.width = segWidth + 'px';
      group.style.height = height + 'px';
      group.style.marginLeft = -(segWidth / 2) + 'px';

      buildSegments();
      buildCap(0);
      buildCap(height);

      host.appendChild(group);
    },

    setRotation(degrees) {
      if (!group) return;
      group.style.transform = `rotateY(${degrees}deg)`;
      updateLighting(degrees);
    },

    dispose() {
      if (group) group.remove();
      group = null;
      segs = [];
    },
  };
}
