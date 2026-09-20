"""Compose the README contact sheets from the raw preview screenshots.

Usage: python3 tools/compose-sheets.py     (run after tools/build-previews.mjs)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
SCALE = 2  # the raw captures are 2x device pixels

PAPER = (247, 248, 250)
INK = (40, 44, 52)
MUTED = (120, 128, 140)

SANS_CANDIDATES = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in SANS_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def load(name: str) -> Image.Image:
    img = Image.open(SHOTS / name).convert("RGB")
    return img.resize((img.width // SCALE, img.height // SCALE), Image.LANCZOS)


def label(draw: ImageDraw.ImageDraw, xy, text: str, size: int = 15, fill=INK) -> None:
    draw.text(xy, text, font=font(size), fill=fill)


def sheet(pairs, out_name: str, title: str, note: str) -> None:
    """pairs: [(screenshot, caption)] laid out two per column, stacked by theme."""
    cols = 2
    rows = len(pairs) // cols
    tiles = [(load(name), caption) for name, caption in pairs]
    tile_w = max(t.width for t, _ in tiles)
    tile_h = max(t.height for t, _ in tiles)

    pad, gap = 22, 18
    head = 74
    caption_h = 26
    width = pad * 2 + tile_w * cols + gap * (cols - 1)
    height = head + rows * (tile_h + caption_h) + gap * (rows - 1) + pad

    canvas = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)

    label(draw, (pad, 18), title, 21)
    label(draw, (pad, 46), note, 13, MUTED)

    for index, (tile, caption) in enumerate(tiles):
        col = index % cols
        row = index // cols
        x = pad + col * (tile_w + gap)
        y = head + row * (tile_h + caption_h + gap)
        canvas.paste(tile, (x, y))
        draw.rectangle([x - 1, y - 1, x + tile_w, y + tile_h], outline=(226, 229, 234))
        label(draw, (x + 2, y + tile_h + 4), caption, 14)

    canvas.save(SHOTS / out_name)
    print("wrote", SHOTS / out_name, canvas.size)


sheet(
    [
        ("light-history.png", "亮色 · 对话 + 历次提问下拉"),
        ("light-drawer.png", "亮色 · 问答总览抽屉"),
        ("dark-history.png", "暗色 · 对话 + 历次提问下拉"),
        ("dark-drawer.png", "暗色 · 问答总览抽屉"),
    ],
    "overview.png",
    "xy-question-nav — 提问导航（亮 / 暗）",
    "预览由本仓库 lib/client.js 的真实样式表渲染；宿主外壳（侧栏 / 页头 / 消息区）为示意。",
)


def compose_strip() -> None:
    """Two columns (light / dark); each column: collapsed strip, then the panel."""
    light = (load("crop-strip-light.png"), load("crop-history-light.png"))
    dark = (load("crop-strip-dark.png"), load("crop-history-dark.png"))

    pad, gap, caption_h, col_gap = 22, 14, 26, 26
    col_w = max(light[1].width, dark[1].width)
    left_h = light[0].height + caption_h + gap + light[1].height + caption_h
    right_h = dark[0].height + caption_h + gap + dark[1].height + caption_h
    body_h = max(left_h, right_h)

    width = pad * 2 + col_w * 2 + col_gap
    height = 78 + body_h + pad

    canvas = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)
    label(draw, (pad, 18), "当前提问 / 历次提问下拉", 20)
    label(draw, (pad, 46), "左列：亮色    右列：暗色 —— 两侧共用同一份样式表，颜色全部来自主题 token", 13, MUTED)

    for col, (strip_tile, hist_tile) in enumerate((light, dark)):
        x = pad + col * (col_w + col_gap)
        y = 78
        canvas.paste(strip_tile, (x, y))
        draw.rectangle([x - 1, y - 1, x + strip_tile.width, y + strip_tile.height], outline=(226, 229, 234))
        y += strip_tile.height + caption_h + gap
        canvas.paste(hist_tile, (x, y))
        draw.rectangle([x - 1, y - 1, x + hist_tile.width, y + hist_tile.height], outline=(226, 229, 234))
        label(draw, (x + 2, y + hist_tile.height + 4), "点箭头向上拉出历次提问", 14)

    canvas.save(SHOTS / "strip.png")
    print("wrote", SHOTS / "strip.png", canvas.size)


compose_strip()
