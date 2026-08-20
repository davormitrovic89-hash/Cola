import { createCssCanRenderer } from './renderer-css.js';

/**
 * Controller der drehenden Dose: Zustand, Eingabe (Drag mit Traegheit,
 * Auto-Rotation) und Animationsschleife. Die eigentliche Darstellung
 * uebernimmt ein austauschbarer Renderer.
 */
export function initCan({
  stage = document.getElementById('can-stage'),
  world = document.getElementById('can-world'),
  spinButton = document.getElementById('spin-btn'),
  renderer = createCssCanRenderer(),
} = {}) {
  if (!stage || !world) return null;

  renderer.mount(world);

  let rotationY = -20;
  let autoRotate = true;
  let isDragging = false;
  let prevX = 0;
  let velocity = 0.35;
  let rafId = null;

  function onPointerDown(e) {
    isDragging = true;
    autoRotate = false;
    prevX = e.clientX;
    stage.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    prevX = e.clientX;
    rotationY += dx * 0.5;
    velocity = dx * 0.1;
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onSpinClick() {
    autoRotate = true;
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointerleave', onPointerUp);
  spinButton?.addEventListener('click', onSpinClick);

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (autoRotate) {
      rotationY += 0.35;
    } else if (!isDragging) {
      rotationY += velocity;
      velocity *= 0.96;
    }
    renderer.setRotation(rotationY);
  }
  frame();

  return {
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointerleave', onPointerUp);
      spinButton?.removeEventListener('click', onSpinClick);
      renderer.dispose();
    },
  };
}
