"""Genera los íconos de la app instalable (PWA) en sciad-frontend/public/icons/.
Uso (una sola vez):  pip install pillow   &&   python scripts/generar-iconos-pwa.py
Salida: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

BRAND = (59, 91, 219)   # #3b5bdb
WHITE = (255, 255, 255)
S = 1024                # se dibuja grande y se reduce (suavizado)
OUT = Path(__file__).resolve().parent.parent / "sciad-frontend" / "public" / "icons"


def glyph(d, scale, ox, oy):
    """Escudo blanco con tres marcadores de QR (coordenadas base 512)."""
    def P(x, y):
        return (ox + x * scale, oy + y * scale)

    shield = [(256, 64), (408, 116), (408, 262), (380, 342), (256, 448), (132, 342), (104, 262), (104, 116)]
    d.polygon([P(*p) for p in shield], fill=WHITE)

    def box(x, y, s=58, w=12):
        d.rectangle([P(x, y), P(x + s, y + s)], fill=BRAND)
        d.rectangle([P(x + w, y + w), P(x + s - w, y + s - w)], fill=WHITE)
        d.rectangle([P(x + w + 8, y + w + 8), P(x + s - w - 8, y + s - w - 8)], fill=BRAND)

    box(160, 148); box(294, 148); box(160, 282)
    for (x, y) in [(294, 282), (336, 282), (294, 324), (336, 324), (315, 303)]:
        d.rectangle([P(x, y), P(x + 22, y + 22)], fill=BRAND)


def make(size, maskable=False, rounded=True):
    img = Image.new("RGB", (S, S), BRAND)
    d = ImageDraw.Draw(img)
    k = 0.62 if maskable else 0.86          # el maskable deja zona segura (~60 %)
    glyph(d, (S / 512) * k, S * (1 - k) / 2, S * (1 - k) / 2)
    out = img.resize((size, size), Image.LANCZOS)
    if rounded and not maskable:
        m = Image.new("L", (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        bg.paste(out, (0, 0), m)
        return bg
    return out


OUT.mkdir(parents=True, exist_ok=True)
make(192).save(OUT / "icon-192.png")
make(512).save(OUT / "icon-512.png")
make(512, maskable=True).save(OUT / "icon-maskable-512.png")
make(180, rounded=False).save(OUT / "apple-touch-icon.png")  # iOS aplica su propia máscara
print("Íconos generados en", OUT)
