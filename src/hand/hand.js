/**
 * Hand-greift-aus-dem-Bildschirm-Illusion.
 *
 * Der Lochrand und die Hand werden gegenlaeufig zur Zeigerposition
 * verschoben/geneigt (Parallaxe). Zusaetzlich reagiert die Szene auf die
 * Geraeteneigung, falls verfuegbar.
 */
export function initHand({
  stage = document.getElementById('hole-stage'),
  ring = document.getElementById('ring'),
  hand = document.getElementById('hand-wrap'),
} = {}) {
  if (!stage || !ring || !hand) return null;

  let targetRX = 0;
  let targetRY = 0;
  let curRX = 0;
  let curRY = 0;
  let targetHX = 0;
  let targetHY = 0;
  let curHX = 0;
  let curHY = 0;
  let rafId = null;

  /** px/py sind normalisierte Auslenkungen im Bereich -0.5 .. 0.5 */
  function setTargets(px, py) {
    targetRY = px * 24;
    targetRX = -py * 24;
    targetHX = px * 30;
    targetHY = py * 18;
  }

  function onPointerMove(e) {
    const rect = stage.getBoundingClientRect();
    setTargets(
      (e.clientX - rect.left) / rect.width - 0.5,
      (e.clientY - rect.top) / rect.height - 0.5
    );
  }

  function onOrientation(e) {
    if (e.beta == null) return;
    setTargets(
      Math.max(-1, Math.min(1, (e.gamma || 0) / 30)),
      Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 30))
    );
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('deviceorientation', onOrientation);

  function frame() {
    rafId = requestAnimationFrame(frame);

    curRX += (targetRX - curRX) * 0.08;
    curRY += (targetRY - curRY) * 0.08;
    curHX += (targetHX - curHX) * 0.08;
    curHY += (targetHY - curHY) * 0.08;

    ring.style.transform = `rotateX(${curRX}deg) rotateY(${curRY}deg)`;
    hand.style.transform =
      `translate(-50%, 0) translateZ(60px) rotate(-4deg) ` +
      `translate(${curHX}px, ${curHY * 0.4}px) rotateY(${curHY * 0.3}deg)`;
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
