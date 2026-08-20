"""
Stellt ein Handfoto frei und erzeugt das PNG mit Alphakanal fuer die
Hand-Illusion.

Aufruf:
    python3 tools/cutout_hand.py <foto.jpg> src/assets/hand.png

Warum der Gruenanteil und nicht der Rotanteil:
Naheliegend waere, Haut ueber "ist roetlich" zu finden. Das funktioniert
fuer den Handruecken gut, versagt aber an den Fingernaegeln — die sind
blass und im Rotanteil kaum vom Boden zu unterscheiden. Der auf die
Gesamthelligkeit normierte Gruenanteil trennt dagegen ueberall:

    Boden        gn = 0.339 .. 0.343   (auch im dunklen Randbereich)
    Haut         gn = 0.318 .. 0.322
    Fingernagel  gn = 0.320 .. 0.327

Weil normiert wird, ist der Wert unabhaengig davon, wie hell die Stelle
ausgeleuchtet ist. Genau deshalb haelt die Schwelle auch in der dunklen
Bildecke, wo jede Helligkeitsschwelle scheitert.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

GREEN_THRESHOLD = 0.3325   # Mitte zwischen Haut/Nagel und Boden
EDGE_THRESHOLD = 0.3285    # schaerfere Schwelle im Randbereich
EDGE_ZONE = 18             # Breite dieses Randbereichs in Pixeln
MIN_LUMA = 26              # unterhalb davon ist gar kein Signal mehr da
DENOISE = 2.5              # Glaettung des Farbverhaeltnisses vor der Schwelle
WORK_WIDTH = 2016          # Aufloesung, in der segmentiert wird
FEATHER = 1.6              # Weichzeichnung der Alphakante in Pixeln
SHRINK = 4                 # Pixel, um die die Maske zurueckgenommen wird
DECONTAMINATE = 10         # Pixel, ueber die Hautfarbe nach aussen gezogen wird
PADDING = 24               # Rand um die Hand im fertigen Ausschnitt
OUTPUT_WIDTH = 1100        # Zielbreite: reicht fuer 2x-Displays, spart Ladezeit
MAX_ARM_GAP = 70           # groesste Luecke, die am Armrand geschlossen wird


def segment(rgb):
    """Binaere Maske der Hand aus dem normierten Gruenanteil."""
    a = rgb.astype(np.float32)
    total = a.sum(2) + 1e-3
    green_ratio = a[..., 1] / total

    # In der dunklen Bildecke bleibt dem Sensor kaum Signal, der
    # Farbanteil rauscht dort um mehrere Prozent und rutscht stellenweise
    # unter die Schwelle — einzelne Bodenfetzen haengen dann an der Hand.
    # Das Verhaeltnis wird deshalb geglaettet, bevor verglichen wird.
    # Naheliegender waere, die Helligkeitsgrenze anzuheben, aber dann
    # bricht der Daumen weg: er liegt selbst im dunklen Teil des Bildes.
    green_ratio = ndi.gaussian_filter(green_ratio, DENOISE)
    mask = (green_ratio < GREEN_THRESHOLD) & (total / 3 > MIN_LUMA)
    # Kanten glaetten, bevor morphologisch gearbeitet wird — sonst bleibt
    # das Sensorrauschen als Treppenmuster in der Silhouette stehen.
    mask = ndi.gaussian_filter(mask.astype(np.float32), 3) > 0.5
    mask = ndi.binary_closing(mask, iterations=6)
    mask = ndi.binary_opening(mask, iterations=3)

    # Groesste zusammenhaengende Flaeche ist die Hand; alles andere
    # (Fussmatte am Bildrand, Reflexe) faellt weg.
    labels, count = ndi.label(mask)
    if count == 0:
        raise SystemExit('Keine Hand gefunden — Schwelle passt nicht zum Foto.')
    sizes = ndi.sum(mask, labels, range(1, count + 1))
    mask = ndi.binary_fill_holes(labels == int(np.argmax(sizes)) + 1)

    # Die Maske ein paar Pixel zuruecknehmen. An der Silhouette mischen
    # sich in jedem Pixel Haut und Boden; laesst man sie stehen, zieht
    # sich ein grauer Saum um die ganze Hand. Das Zuruecknehmen kostet
    # einen Hauch Haut und nimmt nebenbei die letzten Bodenfetzen mit,
    # die noch am Armrand haengen.
    # Entlang des Arms zieht sich ein Band aus Grenzfaellen: Boden, der
    # knapp unter der Schwelle liegt und deshalb als Hand durchgeht. Es
    # ist zu breit, um es einfach wegzuschneiden. Im Randbereich der
    # Maske gilt darum eine schaerfere Schwelle — mitten in der Hand
    # waere sie zu streng, dort steht sie aber auch nicht zur Debatte.
    edge_zone = mask & ~ndi.binary_erosion(mask, iterations=EDGE_ZONE)
    mask &= ~(edge_zone & (green_ratio >= EDGE_THRESHOLD))
    mask = ndi.binary_fill_holes(mask)

    mask = ndi.binary_erosion(mask, iterations=SHRINK)
    mask = ndi.binary_opening(mask, iterations=4)
    labels, count = ndi.label(mask)
    sizes = ndi.sum(mask, labels, range(1, count + 1))
    return ndi.binary_fill_holes(labels == int(np.argmax(sizes)) + 1)


def close_arm_edge(mask, from_x, max_gap):
    """
    Der Arm laeuft am Bildrand in die Vignette und franst dort aus, weil
    dem Sensor im Dunkeln die Farbe ausgeht. Rechts von from_x werden die
    Loecher spaltenweise geschlossen.

    Nur kurze Luecken werden gefuellt: In denselben Spalten liegen weiter
    oben auch der Daumen und weiter unten der Arm. Fuellt man stur von
    oben nach unten durch, wird der Zwischenraum zwischen beiden mit
    Boden zugekleistert.
    """
    filled = mask.copy()
    for x in range(from_x, mask.shape[1]):
        rows = np.flatnonzero(mask[:, x])
        if rows.size < 2:
            continue
        for start, end in zip(rows[:-1], rows[1:]):
            if end - start <= max_gap:
                filled[start:end + 1, x] = True
    return filled


def grade(rgb, alpha):
    """
    Das Foto ist unterbelichtet und flau. Angehoben und leicht waermer
    gestimmt passt die Hand zur dunklen, rot beleuchteten Szene.
    """
    a = rgb.astype(np.float32) / 255
    a = np.clip(a, 0, 1) ** 0.78                 # Mitten anheben
    a = (a - 0.5) * 1.18 + 0.5                   # Kontrast
    a *= np.array([1.06, 0.99, 0.94])            # waermer
    mean = a.mean(2, keepdims=True)
    a = mean + (a - mean) * 1.22                 # Saettigung
    a = np.clip(a, 0, 1)

    # Randentfaerbung: an der Kante mischt jedes Pixel Haut und Boden, und
    # entlang des Arms bleibt davon ein heller Saum stehen. Statt ihn
    # wegzuschneiden — was Substanz kostet — wird die Farbe aus dem
    # Inneren ueber den Rand hinausgezogen. Die Silhouette bleibt exakt
    # wie sie ist, nur ihre Faerbung kommt jetzt garantiert von der Haut.
    inner = ndi.binary_erosion(alpha > 0.5, iterations=DECONTAMINATE)
    if inner.any():
        idx = ndi.distance_transform_edt(~inner, return_distances=False,
                                         return_indices=True)
        a = a[idx[0], idx[1]]
    return (a * 255).astype(np.uint8)


def main(src_path, dst_path):
    image = Image.open(src_path).convert('RGB')
    scale = WORK_WIDTH / image.width
    image = image.resize((WORK_WIDTH, round(image.height * scale)), Image.LANCZOS)
    rgb = np.asarray(image)

    mask = segment(rgb)
    mask = close_arm_edge(mask, int(WORK_WIDTH * 0.82), max_gap=MAX_ARM_GAP)

    alpha = ndi.gaussian_filter(mask.astype(np.float32), FEATHER)
    graded = grade(rgb, alpha)

    ys, xs = np.where(mask)
    y0 = max(0, ys.min() - PADDING)
    y1 = min(mask.shape[0], ys.max() + PADDING)
    x0 = max(0, xs.min() - PADDING)
    x1 = min(mask.shape[1], xs.max() + PADDING)

    out = np.dstack([graded, (alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
    result = Image.fromarray(out, 'RGBA')
    if result.width > OUTPUT_WIDTH:
        height = round(result.height * OUTPUT_WIDTH / result.width)
        result = result.resize((OUTPUT_WIDTH, height), Image.LANCZOS)
    print(f'Ausschnitt {result.size[0]}x{result.size[1]}, '
          f'Deckung {mask.mean() * 100:.1f}% des Fotos')
    if dst_path.lower().endswith('.webp'):
        # WebP mit Alpha ist bei gleicher Qualitaet rund ein Fuenftel so
        # gross wie PNG — bei einem Foto in dieser Groesse macht das den
        # Unterschied zwischen halbem Megabyte und ein paar Zehntel.
        result.save(dst_path, quality=88, method=6)
    else:
        result.save(dst_path, optimize=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
