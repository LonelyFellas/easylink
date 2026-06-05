#!/usr/bin/env python3
"""从 app 主图标生成全套托盘图标(纯色 template 版 + 彩色渐变版)。
用法: python3 scripts/gen-tray-icons.py [源图.png]
源图默认: ~/Downloads/pc-0602/1024_1024.png (白色 logo + 橙色底)
输出: src-tauri/icons/tray-icon*.ico
重跑安全:只覆盖 tray-icon*.ico,不动主图标。
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "src-tauri", "icons")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/pc-0602/1024_1024.png")

SIZE = 256                 # 托盘 ico 画布
LOGO_FRAC = 1.32           # logo 占画布比例(>1 允许略微出血,菜单栏按高度缩放)
THICKEN_PX = 3             # logo 线条加粗(膨胀)像素,补足细描边的视觉重量
BG_ORANGE = (254, 80, 1)   # app 底色,用于抠白色剪影

# 彩色版渐变端点(沿用原有配色)
GRADIENTS = {
    "":     ((245, 127, 193), (155, 130, 255)),  # 默认 粉→紫
    "-sys": ((254, 152, 48),  (255, 100, 112)),  # 系统代理 橙→红
    "-tun": ((164, 210, 35),  (27, 189, 81)),    # TUN 绿
}
BADGE = {"": None, "-sys": "S", "-tun": "T"}


def load_silhouette():
    """把白色 logo 抠成 白色+alpha 的剪影(蓝通道 keying:橙底蓝≈1,白≈255)。"""
    src = Image.open(SRC).convert("RGBA")
    r, g, b, a = src.split()
    bb = b.point(lambda v: int(max(0, min(255, (v - 1) * 255 / 254))))
    # 与原 alpha 取交(squircle 外部本就透明)
    alpha = Image.composite(bb, Image.new("L", src.size, 0), a)
    white = Image.new("RGBA", src.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white.crop(white.getbbox())


def thicken(layer, px):
    """对 RGBA 图层的 alpha 做膨胀,加粗线条(RGB 已是纯白,无需补色)。"""
    if px <= 0:
        return layer
    k = px * 2 + 1                       # MaxFilter 需奇数核
    a = layer.split()[3].filter(ImageFilter.MaxFilter(k))
    out = layer.copy()
    out.putalpha(a)
    return out


def fit_center(layer, canvas_size, frac):
    """等比缩放 layer 使长边占 canvas 的 frac,居中放进透明画布。"""
    target = int(canvas_size * frac)
    w, h = layer.size
    s = target / max(w, h)
    layer = layer.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(layer, ((canvas_size - layer.width) // 2,
                                   (canvas_size - layer.height) // 2))
    return canvas


def vgradient(top, bot, size):
    g = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
    return g.resize((size, size))


def disc_mask(size, pad=0):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse([pad, pad, size - pad, size - pad], fill=255)
    return m


def load_font(px):
    for p in ["/System/Library/Fonts/SFNSRounded.ttf",
              "/System/Library/Fonts/SFNS.ttf",
              "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, px)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_badge(canvas, letter):
    """在右下角把字母镂空(alpha 抠洞),透出底下的菜单栏。无背景圆盘。"""
    fs = int(SIZE * 0.46)            # 角标字号
    font = load_font(fs)
    d0 = ImageDraw.Draw(canvas)
    tb = d0.textbbox((0, 0), letter, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    margin = int(SIZE * 0.04)
    tx = SIZE - margin - tw - tb[0]
    ty = SIZE - margin - th - tb[1]
    hole = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(hole).text((tx, ty), letter, font=font, fill=255)
    ba = canvas.split()[3]
    ba = Image.composite(Image.new("L", (SIZE, SIZE), 0), ba, hole)  # 字母处 alpha=0
    canvas.putalpha(ba)


def save_ico(img, name):
    path = os.path.join(ICONS, name)
    img.save(path, sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])
    print("  ->", name)


def main():
    sil = load_silhouette()
    print("剪影内容尺寸:", sil.size)

    for key, (top, bot) in GRADIENTS.items():
        letter = BADGE[key]

        # ---- 纯色 template 版(三状态同一个干净剪影,不加字母)----
        mono = thicken(fit_center(sil, SIZE, LOGO_FRAC), THICKEN_PX)
        mono_name = "tray-icon-mono.ico" if key == "" else f"tray-icon{key}-mono-new.ico"
        save_ico(mono, mono_name)
        if key:  # 同时覆盖旧命名,保持目录一致
            save_ico(mono, f"tray-icon{key}-mono.ico")

        # ---- 彩色版(白 logo 叠在渐变圆底上)----
        color = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        grad = vgradient(top, bot, SIZE)
        color.paste(grad, (0, 0), disc_mask(SIZE, pad=2))
        logo = thicken(fit_center(sil, SIZE, LOGO_FRAC * 0.72), THICKEN_PX)  # 圆底内 logo 缩小些
        color.alpha_composite(logo)
        if letter:
            draw_badge(color, letter)  # 右下角镂空字母,透出菜单栏
        save_ico(color, "tray-icon.ico" if key == "" else f"tray-icon{key}.ico")

    print("完成。")


if __name__ == "__main__":
    main()
