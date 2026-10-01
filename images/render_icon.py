#!/usr/bin/env python3
"""Render images/icon.png (256x256) for the VS Code marketplace.

Dark editor tile (#1E1E1E) + light braces + VS Code blue tree nodes.
Re-run with: python3 images/render_icon.py
Requires: Pillow (pip install pillow)
"""

from PIL import Image, ImageDraw, ImageFont

SIZE = 256
BG = (30, 30, 30, 255)          # VS Code editor dark
BRACE = (232, 232, 232, 255)    # light braces
DIM = (133, 133, 133, 255)      # dim tree nodes
ACCENT = (79, 193, 255, 255)    # VS Code blue
LINE = (90, 90, 90, 255)        # connector lines

FONT_CANDIDATES = [
    '/System/Library/Fonts/Menlo.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
]


def load_font(size: int):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = 56
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=BG)

    # Braces, left-center.
    font = load_font(148)
    d.text((30, 38), '{', font=font, fill=BRACE)
    d.text((118, 38), '}', font=font, fill=BRACE)

    # Mini explorer tree on the right: connector + three nodes.
    cx, top, gap, r = 212, 66, 62, 11
    d.line([(cx, top), (cx, top + 2 * gap)], fill=LINE, width=5)
    for i, y in enumerate([top, top + gap, top + 2 * gap]):
        fill = ACCENT if i == 0 else DIM
        d.ellipse([cx - r, y - r, cx + r, y + r], fill=fill)
    # Small branch ticks from the spine to each node.
    for y in [top, top + gap, top + 2 * gap]:
        d.line([(cx - 18, y), (cx - r, y)], fill=LINE, width=5)

    img.save('images/icon.png')
    print('wrote images/icon.png')


if __name__ == '__main__':
    main()
