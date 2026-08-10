#!/usr/bin/env python3
"""生成插件图标：小红书红圆角方块 + 白色书签。无第三方依赖，手写 PNG 编码。"""
import os
import struct
import zlib

RED = (255, 36, 66, 255)       # #FF2442
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def make_png(size, path):
    radius = size * 0.22
    # 书签形状（相对坐标）：上方矩形缺口向下的飘带
    bx0, bx1 = size * 0.32, size * 0.68
    by0, by1 = size * 0.24, size * 0.78
    notch_half = (bx1 - bx0) / 2
    notch_top = by1 - size * 0.20  # 缺口顶点高度

    pixels = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px = TRANSPARENT
            # 圆角矩形测试
            in_rect = True
            cx = min(max(x, radius), size - radius)
            cy = min(max(y, radius), size - radius)
            if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
                in_rect = False
            if in_rect:
                px = RED
                # 书签测试
                if bx0 <= x <= bx1 and by0 <= y <= by1:
                    in_bookmark = True
                    if y > notch_top:
                        # 缺口三角：越往下，允许区域越窄
                        t = (y - notch_top) / (by1 - notch_top)
                        half = notch_half * t
                        mid = (bx0 + bx1) / 2
                        if abs(x - mid) < half:
                            in_bookmark = False
                    if in_bookmark:
                        px = WHITE
            row.extend(px)
        pixels.append(b"\x00" + bytes(row))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(pixels), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        p = os.path.join(out, f"{s}.png")
        make_png(s, p)
        print("written", p)
