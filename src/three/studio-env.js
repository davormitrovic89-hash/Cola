import * as THREE from 'three';

/**
 * Erzeugt eine Studio-Umgebung als equirektangulare Textur — ganz ohne
 * externe HDRI-Datei.
 *
 * Metall sieht nur dann nach Metall aus, wenn es etwas zu spiegeln gibt.
 * Entscheidend ist harter Kontrast: ein dunkler Raum mit wenigen sehr
 * hellen Softboxen. Genau das ergibt die typischen langgezogenen
 * Glanzstreifen auf einer Aluminiumdose.
 */
function drawEnvironment(ctx, w, h) {
  // Grundgradient: heller Himmel oben, dunkler Boden unten
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#3a3f47');
  sky.addColorStop(0.35, '#22262c');
  sky.addColorStop(0.5, '#15171b');
  sky.addColorStop(0.52, '#101216');
  sky.addColorStop(1.0, '#07080a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Deckenlicht: breites Band ueber die ganze Oberseite
  ctx.filter = 'blur(28px)';
  const ceiling = ctx.createLinearGradient(0, 0, 0, h * 0.16);
  ceiling.addColorStop(0, 'rgba(255,255,255,0.95)');
  ceiling.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, w, h * 0.16);

  /** Softbox als weiche, sehr helle Flaeche */
  function softbox(cx, cy, rw, rh, intensity, blur) {
    ctx.filter = `blur(${blur}px)`;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rw, rh));
    g.addColorStop(0, `rgba(255,255,255,${intensity})`);
    g.addColorStop(0.55, `rgba(255,255,255,${intensity * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, rh / rw);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - rw * 1.6, cy - rw * 1.6, rw * 3.2, rw * 3.2);
    ctx.restore();
  }

  // Hauptlicht vorne links — erzeugt den kraeftigsten Glanzstreifen
  softbox(w * 0.17, h * 0.30, w * 0.075, h * 0.34, 1.0, 22);
  // Aufhellung hinten rechts — zeichnet die gegenueberliegende Kante nach
  softbox(w * 0.66, h * 0.34, w * 0.10, h * 0.30, 0.55, 34);
  // schmaler Streifen rechts fuer eine harte Glanzkante
  softbox(w * 0.42, h * 0.26, w * 0.022, h * 0.30, 0.9, 10);

  // warme Bodenaufhellung, damit die Unterseite nicht absaeuft
  ctx.filter = 'blur(46px)';
  const bounce = ctx.createLinearGradient(0, h * 0.62, 0, h);
  bounce.addColorStop(0, 'rgba(255,190,150,0)');
  bounce.addColorStop(0.5, 'rgba(255,170,130,0.16)');
  bounce.addColorStop(1, 'rgba(255,150,110,0.05)');
  ctx.fillStyle = bounce;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  ctx.filter = 'none';
}

/**
 * Baut die vorgefilterte Environment-Map. Rueckgabe muss nach Gebrauch
 * ueber dispose() freigegeben werden.
 */
export function createStudioEnvironment(renderer) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  drawEnvironment(ctx, w, h);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(source).texture;

  pmrem.dispose();
  source.dispose();

  return envMap;
}
