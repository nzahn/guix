/**
 * opentype-font-adapter.ts — Concrete FontRenderAdapter using opentype.js.
 *
 * Rasterises TrueType/OpenType glyphs to GUIX GX_GLYPH bitmaps using a
 * pure-JavaScript scanline fill algorithm.  No native bindings required.
 *
 * Usage:
 *   import { registerFontRenderAdapter } from './font-util';
 *   import { createOpentypeFontAdapter }  from './opentype-font-adapter';
 *   registerFontRenderAdapter(createOpentypeFontAdapter());
 */

import * as opentype from 'opentype.js';
import {
    GxGlyph,
    GX_FONT_FORMAT_1BPP,
    GX_FONT_FORMAT_2BPP,
    GX_FONT_FORMAT_4BPP,
    GX_FONT_FORMAT_8BPP,
    type FontRenderAdapter,
} from './font-util';

// ---------------------------------------------------------------------------
// Types from opentype.js path
// ---------------------------------------------------------------------------

/** Command types returned by opentype.js path.commands */
type OtPathCmd =
    | { type: 'M'; x: number; y: number }
    | { type: 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };

// ---------------------------------------------------------------------------
// Line segment (edge) used by the scanline rasterizer
// ---------------------------------------------------------------------------

interface Seg { x0: number; y0: number; x1: number; y1: number }

// ---------------------------------------------------------------------------
// Bezier flattening helpers
// ---------------------------------------------------------------------------

const CURVE_TOLERANCE = 0.25; // pixels

function flattenQuadratic(
    x0: number, y0: number,
    cx: number, cy: number,
    x1: number, y1: number,
    out: Seg[],
    depth = 0,
): void {
    // Midpoint deviation test
    const mx = (x0 + 2 * cx + x1) / 4;
    const my = (y0 + 2 * cy + y1) / 4;
    const lx = (x0 + x1) / 2;
    const ly = (y0 + y1) / 2;
    if (depth < 8 && (Math.abs(mx - lx) + Math.abs(my - ly)) > CURVE_TOLERANCE) {
        const cx0 = (x0 + cx) / 2;
        const cy0 = (y0 + cy) / 2;
        const cx1 = (cx + x1) / 2;
        const cy1 = (cy + y1) / 2;
        const cmx = (cx0 + cx1) / 2;
        const cmy = (cy0 + cy1) / 2;
        flattenQuadratic(x0, y0, cx0, cy0, cmx, cmy, out, depth + 1);
        flattenQuadratic(cmx, cmy, cx1, cy1, x1, y1, out, depth + 1);
    } else {
        out.push({ x0, y0, x1, y1 });
    }
}

function flattenCubic(
    x0: number, y0: number,
    cx0: number, cy0: number,
    cx1: number, cy1: number,
    x1: number, y1: number,
    out: Seg[],
    depth = 0,
): void {
    const mx = (x0 + 3 * cx0 + 3 * cx1 + x1) / 8;
    const my = (y0 + 3 * cy0 + 3 * cy1 + y1) / 8;
    const lx = (x0 + x1) / 2;
    const ly = (y0 + y1) / 2;
    if (depth < 10 && (Math.abs(mx - lx) + Math.abs(my - ly)) > CURVE_TOLERANCE) {
        const ax0 = (x0  + cx0) / 2, ay0 = (y0  + cy0) / 2;
        const ax1 = (cx0 + cx1) / 2, ay1 = (cy0 + cy1) / 2;
        const ax2 = (cx1 + x1 ) / 2, ay2 = (cy1 + y1 ) / 2;
        const bx0 = (ax0 + ax1) / 2, by0 = (ay0 + ay1) / 2;
        const bx1 = (ax1 + ax2) / 2, by1 = (ay1 + ay2) / 2;
        const cmx = (bx0 + bx1) / 2, cmy = (by0 + by1) / 2;
        flattenCubic(x0, y0, ax0, ay0, bx0, by0, cmx, cmy, out, depth + 1);
        flattenCubic(cmx, cmy, bx1, by1, ax2, ay2, x1, y1, out, depth + 1);
    } else {
        out.push({ x0, y0, x1, y1 });
    }
}

// ---------------------------------------------------------------------------
// Path → edge list
// ---------------------------------------------------------------------------

function pathToSegments(commands: OtPathCmd[]): Seg[] {
    const segs: Seg[] = [];
    let cx = 0, cy = 0, startX = 0, startY = 0;

    for (const cmd of commands) {
        switch (cmd.type) {
            case 'M':
                cx = cmd.x; cy = cmd.y;
                startX = cx; startY = cy;
                break;
            case 'L':
                segs.push({ x0: cx, y0: cy, x1: cmd.x, y1: cmd.y });
                cx = cmd.x; cy = cmd.y;
                break;
            case 'Q':
                flattenQuadratic(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, segs);
                cx = cmd.x; cy = cmd.y;
                break;
            case 'C':
                flattenCubic(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, segs);
                cx = cmd.x; cy = cmd.y;
                break;
            case 'Z':
                if (cx !== startX || cy !== startY) {
                    segs.push({ x0: cx, y0: cy, x1: startX, y1: startY });
                }
                cx = startX; cy = startY;
                break;
        }
    }
    return segs;
}

// ---------------------------------------------------------------------------
// Scanline rasterizer → Float32Array coverage
// ---------------------------------------------------------------------------

/**
 * Rasterise an edge list into a W×H coverage map (0.0–1.0 per pixel).
 * Uses SAMPLES_Y super-samples per scanline for anti-aliasing.
 */
function rasterize(segs: Seg[], w: number, h: number, samplesY = 4): Float32Array {
    const cov = new Float32Array(w * h);
    if (segs.length === 0 || w === 0 || h === 0) return cov;

    const inv = 1.0 / samplesY;

    for (let py = 0; py < h; py++) {
        for (let sy = 0; sy < samplesY; sy++) {
            const y = py + (sy + 0.5) * inv;

            // Find all X intersections at scanline Y
            const xs: number[] = [];
            for (const { x0, y0, x1, y1 } of segs) {
                if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
                    const t = (y - y0) / (y1 - y0);
                    xs.push(x0 + t * (x1 - x0));
                }
            }
            if (xs.length < 2) continue;
            xs.sort((a, b) => a - b);

            // Fill between pairs (even-odd rule)
            for (let i = 0; i + 1 < xs.length; i += 2) {
                const xL = xs[i];
                const xR = xs[i + 1];
                const p0 = Math.max(0, Math.floor(xL));
                const p1 = Math.min(w - 1, Math.ceil(xR) - 1);
                for (let px = p0; px <= p1; px++) {
                    const left  = Math.max(xL, px);
                    const right = Math.min(xR, px + 1);
                    if (right > left) {
                        cov[py * w + px] += (right - left) * inv;
                    }
                }
            }
        }
    }
    return cov;
}

// ---------------------------------------------------------------------------
// Coverage → packed BPP byte array
// ---------------------------------------------------------------------------

function packCoverage(cov: Float32Array, w: number, h: number, bpp: number): Uint8Array {
    const rowBytes = Math.ceil(w * bpp / 8);
    const out      = new Uint8Array(rowBytes * h);
    const maxVal   = (1 << bpp) - 1;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const pixel  = Math.min(maxVal, Math.round(cov[y * w + x] * maxVal));
            const bitPos = y * rowBytes * 8 + x * bpp;
            const byteI  = bitPos >> 3;
            const bitOff = bitPos & 7;
            // MSB-first (GUIX glyph map layout)
            out[byteI] |= pixel << (8 - bpp - bitOff);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Parsed font cache (keyed by buffer reference)
// ---------------------------------------------------------------------------

const fontCache = new WeakMap<ArrayBuffer, opentype.Font>();

function getCachedFont(fontBytes: Uint8Array): opentype.Font {
    const key = fontBytes.buffer as ArrayBuffer;
    const hit = fontCache.get(key);
    if (hit) return hit;
    const font = opentype.parse(key);
    fontCache.set(key, font);
    return font;
}

// ---------------------------------------------------------------------------
// OpentypeFontAdapter
// ---------------------------------------------------------------------------

export class OpentypeFontAdapter implements FontRenderAdapter {

    async renderGlyph(
        fontBytes: Uint8Array,
        codePoint: number,
        pixelHeight: number,
        bpp: 1 | 2 | 4 | 8,
    ): Promise<{ glyph: GxGlyph; data: Uint8Array } | null> {

        const font  = getCachedFont(fontBytes);
        const scale = pixelHeight / font.unitsPerEm;

        // Get glyph — return null for missing glyphs
        const glyph = font.charToGlyph(String.fromCodePoint(codePoint));
        if (!glyph || glyph.advanceWidth === undefined) return null;

        // Glyph bounding box in font units
        const bb = glyph.getBoundingBox();
        if (bb.x1 === bb.x2 && bb.y1 === bb.y2) {
            // Whitespace / zero-size glyph — emit advance-only placeholder
            const advance = Math.round(glyph.advanceWidth * scale);
            return {
                glyph: {
                    mapOffset: 0,
                    advance,
                    ascent:    0,
                    descent:   0,
                    left:      0,
                    top:       0,
                    width:     0,
                    height:    0,
                    rowPitch:  0,
                },
                data: new Uint8Array(0),
            };
        }

        // Pixel-space metrics (tight bounding box of the glyph bitmap)
        const xMin_px = Math.floor(bb.x1   * scale);
        const xMax_px = Math.ceil (bb.x2   * scale);
        const yMin_px = Math.floor(bb.y1   * scale);  // font Y (positive = up)
        const yMax_px = Math.ceil (bb.y2   * scale);

        const bw = Math.max(1, xMax_px - xMin_px);   // bitmap width
        const bh = Math.max(1, yMax_px - yMin_px);   // bitmap height

        // ascent = pixels above baseline, descent = pixels below baseline
        const ascent  = Math.max(0,  yMax_px);
        const descent = Math.max(0, -yMin_px);

        // Render path into the tight bitmap.
        // Translate so glyph left edge → x=0, glyph top → y=0.
        // Baseline within bitmap = ascent (pixels from top).
        const path = glyph.getPath(
            -xMin_px,       // shift left edge to x=0 in bitmap
            ascent,         // baseline Y within bitmap (from top)
            pixelHeight,    // font size (determines scale internally)
        ) as { commands: OtPathCmd[] };

        const samplesY = bpp === GX_FONT_FORMAT_1BPP ? 1 :
                         bpp === GX_FONT_FORMAT_2BPP ? 2 :
                         bpp === GX_FONT_FORMAT_4BPP ? 4 : 8;

        const coverage = rasterize(pathToSegments(path.commands as OtPathCmd[]), bw, bh, samplesY);
        const data     = packCoverage(coverage, bw, bh, bpp);

        const rowPitch = Math.ceil(bw * bpp / 8);
        const advance  = Math.round(glyph.advanceWidth * scale);

        const glyphOut: GxGlyph = {
            mapOffset: 0,          // filled in by generateFontData
            advance,
            ascent,
            descent,
            left:     xMin_px,    // left bearing (may be negative for italic)
            top:      yMax_px,    // top of bitmap relative to baseline (positive = above)
            width:    bw,
            height:   bh,
            rowPitch,
        };

        return { glyph: glyphOut, data };
    }
}

/**
 * Factory — creates a ready-to-use OpentypeFontAdapter.
 * Typically called once at extension activation:
 *   registerFontRenderAdapter(createOpentypeFontAdapter());
 */
export function createOpentypeFontAdapter(): OpentypeFontAdapter {
    return new OpentypeFontAdapter();
}

// Re-export BPP constants for callers
export { GX_FONT_FORMAT_1BPP, GX_FONT_FORMAT_2BPP, GX_FONT_FORMAT_4BPP, GX_FONT_FORMAT_8BPP };
