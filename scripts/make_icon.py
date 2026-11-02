#!/usr/bin/env python3
"""Generate resources/icon.png (128x128, PNG, not SVG) from the six-dot
Settling mark coordinates in ollada docs/assets/logo.svg.

Six circles, fill #6C6FD8, at [26,34],[22,76],[38,114],[72,74],[108,52],
[108,96] in a 140x140 viewBox, radius 10. Scaled to 128x128.
vsce rejects user-provided SVG icons, so the packaged icon must be PNG.
Stdlib only: PNG encoder with zlib, circles rasterised by distance.
Run: python3 scripts/make_icon.py
"""
import math
import struct
import zlib
from pathlib import Path

SIZE = 128
CENTERS = [(26, 34), (22, 76), (38, 114), (72, 74), (108, 52), (108, 96)]
RADIUS_VIEW = 10
SCALE = SIZE / 140.0
R = RADIUS_VIEW * SCALE
# #6C6FD8
RGB = (0x6C, 0x6F, 0xD8)


def chunk(kind: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(kind)
    crc = zlib.crc32(data, crc)
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc & 0xFFFFFFFF)


def main() -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # filter: none
        for x in range(SIZE):
            cx, cy = x + 0.5, y + 0.5
            inside = False
            for vx, vy in CENTERS:
                dx = cx - vx * SCALE
                dy = cy - vy * SCALE
                if math.hypot(dx, dy) <= R:
                    inside = True
                    break
            if inside:
                raw.extend((*RGB, 255))
            else:
                raw.extend((0, 0, 0, 0))
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), level=9))
    png += chunk(b"IEND", b"")
    out = Path(__file__).resolve().parent.parent / "resources" / "icon.png"
    out.write_bytes(png)
    print(f"wrote {out} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
