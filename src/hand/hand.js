import handUrl from '../assets/hand.webp';

/**
 * Hand-greift-aus-dem-Bildschirm-Illusion mit einem freigestellten Foto.
 *
 * Die Tiefe entsteht aus vier Ebenen, die sich unterschiedlich schnell
 * gegen die Zeigerposition bewegen — je naeher am Betrachter, desto
 * staerker der Ausschlag:
 *
 *   1. Lochrand  kippt entgegen der Zeigerrichtung (liegt am weitesten hinten)
 *   2. Schatten  wandert im Loch mit, aber weniger weit als die Hand
 *   3. Hand      staerkster Ausschlag, sie steht vorne
 *   4. Glanz     folgt der Hand, sitzt aber auf den Fingerkuppen
 *
 * Der Unterschied im Ausschlag ist der eigentliche Trick: Bewegen sich
 * alle Ebenen gleich weit, sieht es aus wie ein Bild, das man verschiebt.
 * Bewegen sie sich unterschiedlich weit, liest das Auge Tiefe.
 */
export function initHand({
  stage = document.getElementById('hole-stage'),
  ring = document.getElementById('ring'),
  photo = document.getElementById('hand-photo'),
  glint = document.getElementById('hand-glint'),
  shadow = document.getElementById('hand-shadow'),
} = {}) {
  if (!stage || !ring || !photo) return null;

  photo.src = handUrl;
  if (glint) glint.src = handUrl;

  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let rafId = null;

  /** px/py sind normalisierte Auslenkungen im Bereich -0.5 .. 0.5 */
  function setTarget(px, py) {
    target.x = Math.max(-0.5, Math.min(0.5, px));
    target.y = Math.max(-0.5, Math.min(0.5, py));
  }

  function onPointerMove(e) {
    const rect = stage.getBoundingClientRect();
    setTarget(
      (e.clientX - rect.left) / rect.width - 0.5,
      (e.clientY - rect.top) / rect.height - 0.5
    );
  }

  function onOrientation(e) {
    if (e.beta == null) return;
    setTarget((e.gamma || 0) / 60, ((e.beta || 0) - 45) / 60);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('deviceorientation', onOrientation);

  function frame() {
    rafId = requestAnimationFrame(frame);
    current.x += (target.x - current.x) * 0.08;
    current.y += (target.y - current.y) * 0.08;

    const { x, y } = current;

    ring.style.transform = `rotateX(${-y * 26}deg) rotateY(${x * 26}deg)`;

    // Die Hand faehrt am weitesten aus und dreht sich leicht mit, als
    // wuerde sie dem Zeiger folgen.
    const handTransform =
      `translate(-82%, 0) rotate(var(--hand-tilt)) ` +
      `translate(${x * 58}px, ${y * 26}px) ` +
      `rotate(${x * 5}deg) scale(${1 + Math.abs(x) * 0.03})`;
    photo.style.transform = handTransform;

    if (glint) {
      // Der Glanz sitzt auf derselben Hand, muss also exakt dieselbe
      // Transformation bekommen. Er wird nur staerker, wenn die Hand zur
      // Seite faehrt und mehr Licht auf die Kuppen faellt.
      glint.style.transform = handTransform;
      glint.style.opacity = String(0.16 + Math.abs(x) * 0.2);
    }

    if (shadow) {
      // Der Schatten bleibt hinter der Hand zurueck und waechst, wenn sie
      // zur Seite faehrt — so als wandere die Lichtquelle nicht mit.
      shadow.style.transform =
        `translate(-50%, 0) translate(${x * 26}px, ${y * 10}px) ` +
        `scale(${1 + Math.abs(x) * 0.16}, 1)`;
      shadow.style.opacity = String(0.75 - Math.abs(x) * 0.18);
    }
  }
  frame();

  return {
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onOrientation);
    },
  };
}
