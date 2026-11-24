"""Gera os ícones e o logotipo do passe da Apple Wallet a partir do ícone da app.

- icon*.png: o "V" turquesa sobre branco (notificações e ecrã de bloqueio)
- logo*.png: o "V" em branco com fundo transparente (canto superior do passe,
  sobre o fundo turquesa da marca)

Uso (a partir de expo/): python3 scripts/make-wallet-assets.py
Reescreve as constantes ICON_* e LOGO_* em supabase/functions/wallet-pass/assets.ts.
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/images/icon.png"
ASSETS_TS = ROOT / "supabase/functions/wallet-pass/assets.ts"

src = Image.open(SRC).convert("RGB")
w, h = src.size

# Máscara do "V": píxeis turquesa (azul/verde altos, vermelho baixo)
mask = Image.new("L", (w, h), 0)
sp, mp = src.load(), mask.load()
for y in range(h):
    for x in range(w):
        r, g, b = sp[x, y]
        # intensidade: quanto mais longe do branco no canal vermelho, mais "V"
        a = max(0, min(255, int((255 - r) * 255 / (255 - 2))))
        mp[x, y] = a
bbox = mask.getbbox()
mask = mask.crop(bbox)


def png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def white_logo(height: int) -> Image.Image:
    mw, mh = mask.size
    width = round(mw * height / mh)
    m = mask.resize((width, height), Image.LANCZOS)
    img = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    img.putalpha(m)
    return img


def icon(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)


consts = {
    "ICON_29": png_b64(icon(29)),
    "ICON_58": png_b64(icon(58)),
    "ICON_87": png_b64(icon(87)),
    # Logotipo: até 160x50 pt; o "V" com 30 pt de altura fica equilibrado com o texto
    "LOGO_1X": png_b64(white_logo(30)),
    "LOGO_2X": png_b64(white_logo(60)),
    "LOGO_3X": png_b64(white_logo(90)),
}

text = ASSETS_TS.read_text()
for name, value in consts.items():
    line = f'export const {name} = "{value}";'
    pattern = re.compile(rf'^export const {name} = ".*";$', re.M)
    if pattern.search(text):
        text = pattern.sub(lambda _m: line, text)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
ASSETS_TS.write_text(text)
print("ok", {k: len(v) for k, v in consts.items()})
