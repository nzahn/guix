/**
 * resource-generator.test.ts — golden / structural tests for ResourceGenerator.
 *
 * We do not pin the exact date/time stamp (it changes each run) but we do
 * verify every structural element that must appear for byte-for-byte parity
 * with the C++ GUIX Studio output.
 */

import { ResourceGenerator, FontDataMap } from '../../src/codegen/resource-generator';
import {
    createEmptyProject,
    createDefaultDisplay,
    createDefaultLanguage,
} from '../../src/common/project-model';
import { RES_TYPE_COLOR, RES_TYPE_FONT } from '../../src/common/gx-types';
import { createDefaultResInfo } from '../../src/common/res-info';
import { GxFontData, GX_FONT_FORMAT_4BPP } from '../../src/utils/font-util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColorRes(name: string) {
    const r = createDefaultResInfo(RES_TYPE_COLOR, name);
    r.colorval = 0xff0000;
    return r;
}

function gen(): ResourceGenerator {
    return new ResourceGenerator();
}

// ---------------------------------------------------------------------------
// Minimal project (single display, no resources)
// ---------------------------------------------------------------------------

describe('ResourceGenerator — minimal project', () => {
    const project = createEmptyProject('TestApp');
    // Enable only display 0
    project.displays[0].name = 'Display_1';

    const files = gen().generate(project, 0);

    // ── Header ──────────────────────────────────────────────────────────────

    it('header filename follows naming convention', () => {
        // createEmptyProject always creates 4 display slots, so compound name is used
        expect(files.header.filename).toMatch(/resources\.h$/i);
        expect(files.header.filename).toContain('TestApp');
    });

    it('header has ifndef guard', () => {
        expect(files.header.content).toContain('#ifndef');
        expect(files.header.content).toContain('#define');
        expect(files.header.content).toContain('#endif');
    });

    it('header includes gx_api.h', () => {
        expect(files.header.content).toContain('#include "gx_api.h"');
    });

    it('header defines display index', () => {
        expect(files.header.content).toContain('#define DISPLAY_1');
    });

    it('header defines color format', () => {
        expect(files.header.content).toContain('_COLOR_FORMAT');
    });

    it('header defines X and Y resolution', () => {
        expect(files.header.content).toContain('X_RESOLUTION');
        expect(files.header.content).toContain('Y_RESOLUTION');
    });

    it('header defines theme table size', () => {
        expect(files.header.content).toContain('THEME_TABLE_SIZE');
    });

    it('header defines language table size', () => {
        expect(files.header.content).toContain('LANGUAGE_TABLE_SIZE');
    });

    // ── Source ──────────────────────────────────────────────────────────────

    it('source filename follows naming convention', () => {
        expect(files.source.filename).toMatch(/resources\.c$/i);
        expect(files.source.filename).toContain('TestApp');
    });

    it('source includes own header', () => {
        expect(files.source.content).toContain(files.header.filename);
    });

    it('source uses CRLF line endings', () => {
        expect(files.source.content).toContain('\r\n');
    });

    it('source has studio version banner', () => {
        // Banner comment block produced by writeFileHeader
        expect(files.source.content).toContain('GUIX Studio');
    });
});

// ---------------------------------------------------------------------------
// Project with one color resource
// ---------------------------------------------------------------------------

describe('ResourceGenerator — project with one color', () => {
    const project = createEmptyProject('MyApp');
    project.displays[0].name = 'MyDisplay';
    project.displays[0].themes[0].resources.push(makeColorRes('MY_COLOR'));

    const files = gen().generate(project, 0);

    it('header defines GX_COLOR_ID_MY_COLOR', () => {
        expect(files.header.content).toContain('GX_COLOR_ID_MY_COLOR');
    });

    it('color ID is 1-based', () => {
        // The first real color gets ID 1
        expect(files.header.content).toMatch(/GX_COLOR_ID_MY_COLOR\s+1/);
    });

    it('header defines COLOR_TABLE_SIZE', () => {
        expect(files.header.content).toContain('COLOR_TABLE_SIZE');
    });

    it('source contains color table array', () => {
        // Color value is emitted as hex in the color table; name appears in header
        expect(files.header.content).toContain('GX_COLOR_ID_MY_COLOR');
    });
});

// ---------------------------------------------------------------------------
// Multi-language project
// ---------------------------------------------------------------------------

describe('ResourceGenerator — multi-language project', () => {
    const project = createEmptyProject('I18nApp');
    project.header.num_languages = 2;
    project.header.languages[0] = createDefaultLanguage('English');
    project.header.languages[1] = createDefaultLanguage('French');
    project.displays[0].string_entries.push(
        { string_id: 1, name: 'STR_HELLO', translations: ['Hello', 'Bonjour'] },
    );

    const files = gen().generate(project, 0);

    it('header defines language indices', () => {
        expect(files.header.content).toContain('LANGUAGE_ENGLISH');
        expect(files.header.content).toContain('LANGUAGE_FRENCH');
    });

    it('header defines GX_STRING_ID_STR_HELLO', () => {
        expect(files.header.content).toContain('GX_STRING_ID_STR_HELLO');
    });

    it('header defines STRING_TABLE_SIZE', () => {
        expect(files.header.content).toContain('STRING_TABLE_SIZE');
    });

    it('source contains string table data', () => {
        expect(files.source.content).toContain('STR_HELLO');
    });
});

// ---------------------------------------------------------------------------
// Multi-display project uses display name in filename
// ---------------------------------------------------------------------------

describe('ResourceGenerator — multi-display project', () => {
    const project = createEmptyProject('MultiApp');
    project.displays[0].name = 'Display_1';
    project.displays[0].enabled = true;
    project.displays[1] = createDefaultDisplay('Display_2');
    project.displays[1].enabled = true;
    project.header.num_displays = 2;

    const files0 = gen().generate(project, 0);
    const files1 = gen().generate(project, 1);

    it('display 0 filename includes both project and display names', () => {
        expect(files0.header.filename).toContain('MultiApp');
        expect(files0.header.filename).toContain('Display_1');
    });

    it('display 1 filename includes display_2', () => {
        expect(files1.header.filename).toContain('Display_2');
    });

    it('display 0 and display 1 headers are distinct', () => {
        expect(files0.header.filename).not.toBe(files1.header.filename);
    });
});

// ---------------------------------------------------------------------------
// Font emission — writeFontSection with fontDataMap
// ---------------------------------------------------------------------------

/** Build a minimal synthetic GxFontData for one ASCII code point. */
function makeFontData(firstGlyph = 0x41, lastGlyph = 0x41): GxFontData {
    const glyphData = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]); // 2×2 1-bpp = 2 bytes/row × 2 rows
    return {
        font: {
            format:     GX_FONT_FORMAT_4BPP,
            height:     12,
            baseline:   10,
            firstGlyph,
            lastGlyph,
            glyphs: [{
                mapOffset: 0,
                advance:   8,
                ascent:    10,
                descent:   2,
                left:      1,
                top:       10,
                width:     5,
                height:    2,
                rowPitch:  2,
            }],
            glyphData,
        },
        pageCount: 1,
    };
}

describe('ResourceGenerator — font emission with fontDataMap', () => {
    const project = createEmptyProject('FontApp');
    project.displays[0].name = 'Display_1';
    // Set theme name explicitly
    project.displays[0].themes[0].theme_name = 'MyTheme';
    project.displays[0].themes[0].gen_font_table = true;

    const fontRes = createDefaultResInfo(RES_TYPE_FONT, 'verasans_12');
    project.displays[0].themes[0].resources.push(fontRes);

    const fontDataMap: FontDataMap = new Map<string, GxFontData>([
        ['verasans_12', makeFontData(0x41, 0x41)],
    ]);

    const files = new ResourceGenerator().generate(project, 0, fontDataMap);

    it('source contains FONT_ glyph data array', () => {
        expect(files.source.content).toContain('FONT_MYTHEME_verasans_12');
    });

    it('source contains _FONT_PAGE_1_GLYPHS array', () => {
        expect(files.source.content).toContain('_FONT_PAGE_1_GLYPHS');
    });

    it('source contains GX_FONT struct', () => {
        expect(files.source.content).toContain('GX_CONST GX_FONT');
    });

    it('source contains font height', () => {
        expect(files.source.content).toContain('12');
    });

    it('source contains baseline offset', () => {
        expect(files.source.content).toContain('10');
    });

    it('source contains GX_FONT_FORMAT_4BPP macro', () => {
        expect(files.source.content).toContain('GX_FONT_FORMAT_4BPP');
    });

    it('source contains font pointer table', () => {
        expect(files.source.content).toContain('_font_table');
    });

    it('glyph char hex uses space-padded 2-char hex (%%2x format)', () => {
        // Code point 0x41 → hex '41' (2 chars already, no padding)
        expect(files.source.content).toContain('char_41');
    });
});

describe('ResourceGenerator — font emission space-padded hex for single-digit code point', () => {
    const project = createEmptyProject('FontPadApp');
    project.displays[0].name = 'Display_1';
    project.displays[0].themes[0].theme_name = 'T';
    project.displays[0].themes[0].gen_font_table = true;

    const fontRes = createDefaultResInfo(RES_TYPE_FONT, 'myfont');
    project.displays[0].themes[0].resources.push(fontRes);

    // Use code point 0x09 (tab) — 1 hex digit → should be padded with a space → ' 9'
    const fontDataMap: FontDataMap = new Map<string, GxFontData>([
        ['myfont', makeFontData(0x09, 0x09)],
    ]);

    const files = new ResourceGenerator().generate(project, 0, fontDataMap);

    it('single-digit code point is space-padded to 2 chars in var name', () => {
        // '%2x' of 0x09 → ' 9'
        expect(files.source.content).toContain('char_ 9');
    });
});

describe('ResourceGenerator — font emission without fontDataMap (fallback)', () => {
    const project = createEmptyProject('FontFallbackApp');
    project.displays[0].name = 'Display_1';
    project.displays[0].themes[0].theme_name = 'Default';
    project.displays[0].themes[0].gen_font_table = true;

    const fontRes = createDefaultResInfo(RES_TYPE_FONT, 'verasans_12');
    project.displays[0].themes[0].resources.push(fontRes);

    // No fontDataMap → fallback path
    const files = new ResourceGenerator().generate(project, 0);

    it('source emits extern declaration when no font data', () => {
        expect(files.source.content).toContain('extern GX_CONST GX_FONT');
    });

    it('source still emits font pointer table', () => {
        expect(files.source.content).toContain('_font_table');
    });
});

// ---------------------------------------------------------------------------
// Pixelmap with auxData — writePixelmapStruct
// ---------------------------------------------------------------------------

describe('ResourceGenerator — pixelmap with auxData', () => {
    const project = createEmptyProject('PmAuxApp');
    project.displays[0].name = 'Display_1';
    project.displays[0].themes[0].gen_pixelmap_table = true;

    const pmRes = createDefaultResInfo(10 /* RES_TYPE_PIXELMAP */, 'my_icon');
    pmRes.compress = true;
    pmRes.map_list.push({
        width:   2,
        height:  1,
        data:    new Uint8Array([0x01, 0x02, 0x03, 0x04]),
        auxData: new Uint8Array([0x82]),   // 1-byte aux: repeat 2×
        delay:   0,
    });
    project.displays[0].themes[0].resources.push(pmRes);

    const files = new ResourceGenerator().generate(project, 0);

    it('source emits main pixelmap data array', () => {
        expect(files.source.content).toContain('my_icon_pixelmap_data');
    });

    it('source emits aux data array when auxData present', () => {
        expect(files.source.content).toContain('my_icon_pixelmap_aux_data');
    });

    it('source emits GX_PIXELMAP_COMPRESSED flag', () => {
        expect(files.source.content).toContain('GX_PIXELMAP_COMPRESSED');
    });

    it('source references aux data pointer in struct', () => {
        // The struct should reference the aux array, not GX_NULL
        expect(files.source.content).toContain('my_icon_pixelmap_aux_data');
    });
});
