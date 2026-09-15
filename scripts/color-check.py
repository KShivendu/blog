#!/usr/bin/env python3
"""Colour separation + contrast checks for the blog's chart palette.

Written because the palette work needs measurement rather than opinion, and the
bundled validator lives in a temp dir that gets cleaned up.

  OKLab dE   perceptual distance, x100, the same scale the dataviz method uses.
             >= 15 is the floor for "a full-colour reader can tell these apart".
             >= 8 is the target under simulated colourblindness.
  contrast   WCAG ratio against a surface. Fills want >= 3:1, or a visible label.

Usage:
  python3 scripts/color-check.py sep "#6f7771" "#8fb19f"          # pair distance
  python3 scripts/color-check.py contrast "#6f7771" "#fbfcfb"     # vs a surface
  python3 scripts/color-check.py oklch "#6f7771"                  # L, C, H
"""
import sys


def _srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def to_oklab(hex_color):
    r, g, b = (_srgb_to_linear(v) for v in _hex_to_rgb(hex_color))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklch(hex_color):
    import math

    L, a, b = to_oklab(hex_color)
    return L, math.sqrt(a * a + b * b), math.degrees(math.atan2(b, a)) % 360


def separation(h1, h2):
    """OKLab distance x100. The dataviz floor for normal vision is 15."""
    a, b = to_oklab(h1), to_oklab(h2)
    return 100 * sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def relative_luminance(hex_color):
    r, g, b = (_srgb_to_linear(v) for v in _hex_to_rgb(hex_color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    a, b = relative_luminance(fg), relative_luminance(bg)
    lo, hi = sorted((a, b))
    return (hi + 0.05) / (lo + 0.05)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "sep":
        d = separation(sys.argv[2], sys.argv[3])
        print("%s vs %s  dE %.1f  %s" % (sys.argv[2], sys.argv[3], d,
                                         "PASS" if d >= 15 else "BELOW 15 FLOOR"))
    elif cmd == "contrast":
        c = contrast(sys.argv[2], sys.argv[3])
        print("%s on %s  %.2f:1  %s" % (sys.argv[2], sys.argv[3], c,
                                        "PASS" if c >= 3 else "below 3:1, needs a label"))
    elif cmd == "oklch":
        L, C, H = oklch(sys.argv[2])
        print("%s  L %.3f  C %.3f  H %.0f" % (sys.argv[2], L, C, H))
