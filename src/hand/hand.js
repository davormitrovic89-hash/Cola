import { createThreeHandRenderer } from './renderer-three.js';

/**
 * Controller der Hand-Illusion.
 *
 * Der Lochrand kippt weiterhin per CSS gegen die Zeigerposition — das ist
 * die Parallaxe, die dem Loch Tiefe gibt. Die Hand selbst ist eine
 * WebGL-Szene, die derselben Eingabe folgt: Sie richtet sich zum Zeiger
 * aus und greift zu, je naeher er der Mitte kommt.
 */
export function initHand({
  stage = document.getElementById('hole-stage'),
  ring = document.getElementById('ring'),
  world = document.getElementById('hand-world'),
  renderer = createThreeHandRenderer(),
} = {}) {
  if (!stage || !ring || !world) return null;

  renderer.mount(world);

  const target = { rx: 0, ry: 0, yaw: 0, pitch: 0, grab: 0 };
  const current = { rx: 0, ry: 0, yaw: 0, pitch: 0, grab: 0 };
  let rafId = null;

  /** px/py sind normalisierte Auslenkungen im Bereich -0.5 .. 0.5 */
  function setTargets(px, py) {
    target.ry = px * 24;
    target.rx = -py * 24;
    target.yaw = px * 0.85;
    target.pitch = -py * 0.55;
    // Je naeher der Zeiger an der Lochmitte, desto mehr greift die Hand zu.
    const distance = Math.min(1, Math.hypot(px, py) / 0.45);
    target.grab = 1 - distance;
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
      Math.max(-0.5, Math.min(0.5, (e.gamma || 0) / 45)),
      Math.max(-0.5, Math.min(0.5, ((e.beta || 0) - 45) / 45))
    );
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('deviceorientation', onOrientation);

  function frame() {
    rafId = requestAnimationFrame(frame);

    for (const key of Object.keys(target)) {
      current[key] += (target[key] - current[key]) * 0.08;
    }

    ring.style.transform = `rotateX(${current.rx}deg) rotateY(${current.ry}deg)`;
    renderer.setPose({
      yaw: current.yaw,
      pitch: current.pitch,
      grab: current.grab,
      reach: 1,
    });
  }
  frame();

  return {
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onOrientation);
      renderer.dispose();
    },
  };
}
