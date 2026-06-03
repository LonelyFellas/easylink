#!/usr/bin/env python3
"""Generate a clean EasyLink DMG background image.

Tauri overlays the app icon and the Applications-folder icon on top of this
background (positions come from tauri.macos.conf.json). So this image must NOT
contain any app logo where those icons land -- it only provides branding at the
top, a drag arrow in the middle, and instructions at the bottom.
"""
import math
from PIL import Image, ImageDraw, ImageFont

# Logical DMG window size from tauri.macos.conf.json -> dmg.windowSize
W, H = 660, 400
ICON_DIR = "src-tauri/icons"
OUT = "src-tauri/images/background.png"
OUT_2X = "src-tauri/images/background@2x.png"

# Brand colors (EasyLink orange)
ORANGE = (255, 94, 0)
INK = (33, 37, 41)
SUBTLE = (120, 128, 138)

PINGFANG = "/System/Library/Fonts/PingFang.ttc"
HEITI = "/System/Library/Fonts/STHeiti Medium.ttc"
HELV = "/System/Library/Fonts/HelveticaNeue.ttc"


def load_font(paths, size, index=0):
    for p, idx in paths:
        try:
            return ImageFont.truetype(p, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def render(scale: int):
    w, h = W * scale, H * scale
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Soft vertical gradient background, very light.
    top = (252, 253, 255)
    bot = (240, 243, 248)
    for y in range(h):
        t = y / h
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        d.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # ---- Brand row (top center): EasyLink icon + wordmark ----
    icon = Image.open(f"{ICON_DIR}/icon.png").convert("RGBA")
    isz = 40 * scale
    icon = icon.resize((isz, isz), Image.LANCZOS)

    title_font = load_font([(HELV, 0)], 30 * scale)
    title = "EasyLink"
    tb = d.textbbox((0, 0), title, font=title_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    gap = 12 * scale
    block_w = isz + gap + tw
    bx = (w - block_w) // 2
    by = 36 * scale
    img.alpha_composite(icon, (bx, by))
    d.text((bx + isz + gap, by + (isz - th) // 2 - tb[1]), title,
           font=title_font, fill=INK)

    # ---- Drag arrow (middle) ----
    # Icons are overlaid by tauri around y=170 (app x=180, Applications x=480).
    # Draw a curved arrow between them, slightly above the icon centers.
    cy = 150 * scale
    x0, x1 = 270 * scale, 392 * scale
    lift = 34 * scale
    pts = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = cy - math.sin(math.pi * t) * lift
        pts.append((x, y))
    d.line(pts, fill=INK, width=max(4, 5 * scale), joint="curve")
    # Arrow head at the end.
    ex, ey = pts[-1]
    pex, pey = pts[-4]
    ang = math.atan2(ey - pey, ex - pex)
    ah = 16 * scale
    for da in (math.radians(150), math.radians(-150)):
        hx = ex + ah * math.cos(ang + da)
        hy = ey + ah * math.sin(ang + da)
        d.line([(ex, ey), (hx, hy)], fill=INK, width=max(4, 5 * scale))

    # ---- Instruction text (bottom) ----
    cn_font = load_font([(PINGFANG, 2), (HEITI, 1)], 19 * scale)
    en_font = load_font([(HELV, 0)], 16 * scale)
    cn = "将图标拖入 Applications 文件夹安装"
    en = "Drag the icon to the Applications folder"

    cb = d.textbbox((0, 0), cn, font=cn_font)
    d.text(((w - (cb[2] - cb[0])) // 2, 318 * scale), cn, font=cn_font, fill=INK)
    eb = d.textbbox((0, 0), en, font=en_font)
    d.text(((w - (eb[2] - eb[0])) // 2, 352 * scale), en, font=en_font, fill=SUBTLE)

    return img.convert("RGB")


render(1).save(OUT)
render(2).save(OUT_2X)
print("wrote", OUT, "and", OUT_2X)
