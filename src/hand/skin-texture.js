import * as THREE from 'three';

/**
 * Prozedurale Hauttexturen.
 *
 * Eine Flaeche mit einer einzigen Farbe und einer einzigen Rauheit sieht
 * unweigerlich nach Plastik aus, weil in der Natur beides variiert. Zwei
 * Texturen reichen, um das zu brechen:
 *
 *   map          - leichte Farbflecken, warm bis rosig
 *   roughnessMap - feines Rauschen, damit die Glanzlichter aufbrechen
 *                  statt als glatte Flecken auf der Haut zu kleben
 *
 * Beide werden zur Laufzeit gezeichnet, es wird nichts nachgeladen.
 */

const SIZE = 512;

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

function finish(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  if (colorSpace) texture.colorSpace = colorSpace;
  return texture;
}

/** Weiche Farbflecken in Hauttoenen. */
function drawColor(ctx) {
  ctx.fillStyle = '#d8a381';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const tints = ['#c9805e', '#e6b795', '#c26b62', '#dfa778', '#b9755f'];
  ctx.filter = 'blur(18px)';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 20 + Math.random() * 70;
    ctx.globalAlpha = 0.05 + Math.random() * 0.09;
    ctx.fillStyle = tints[(Math.random() * tints.length) | 0];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/** Feinkoerniges Rauschen fuer die Rauheit. */
function drawRoughness(ctx) {
  const image = ctx.createImageData(SIZE, SIZE);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    // Grundrauheit 0.56, aufgebrochen um etwa +/- 0.12
    const v = 143 + (Math.random() - 0.5) * 62;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // groebere Flecken darueber: Haut ist auf Knoecheln trockener als in
  // den Beugen
  ctx.filter = 'blur(14px)';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#6a6a6a';
    ctx.beginPath();
    ctx.arc(Math.random() * SIZE, Math.random() * SIZE, 25 + Math.random() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

export function createSkinTextures() {
  const colorCanvas = makeCanvas();
  drawColor(colorCanvas.getContext('2d'));

  const roughCanvas = makeCanvas();
  drawRoughness(roughCanvas.getContext('2d'));

  return {
    map: finish(colorCanvas, THREE.SRGBColorSpace),
    roughnessMap: finish(roughCanvas),
  };
}
