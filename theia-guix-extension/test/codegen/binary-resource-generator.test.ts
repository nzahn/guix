/**
 * binary-resource-generator.test.ts — structural tests for BinaryResourceGenerator.
 */

import {
    BinaryResourceGenerator,
    BinaryResourceFile,
    BINARY_FORMAT_RAW,
    BINARY_FORMAT_SREC,
} from '../../src/codegen/binary-resource-generator';
import { createEmptyProject } from '../../src/common/project-model';

// Magic constant 'GXBI' = 0x47584249
const GX_RESOURCE_MAGIC = 0x47584249;

function gen(): BinaryResourceGenerator {
    return new BinaryResourceGenerator();
}

// ---------------------------------------------------------------------------
// Minimal project
// ---------------------------------------------------------------------------

describe('BinaryResourceGenerator — minimal project (RAW)', () => {
    const project = createEmptyProject('BinTest');
    project.displays[0].name = 'Display_1';
    const file: BinaryResourceFile = gen().generate(project, 0, BINARY_FORMAT_RAW);

    it('filename ends with .bin', () => {
        expect(file.filename).toMatch(/\.bin$/);
    });

    it('filename contains project name', () => {
        expect(file.filename).toContain('BinTest');
    });

    it('srec field is empty for RAW format', () => {
        expect(file.srec).toBe('');
    });

    it('content is a non-empty Uint8Array', () => {
        expect(file.content).toBeInstanceOf(Uint8Array);
        expect(file.content.length).toBeGreaterThan(0);
    });

    it('content starts with GX_RESOURCE_MAGIC (GXBI)', () => {
        const view = new DataView(file.content.buffer);
        // Little-endian (big_endian = false)
        expect(view.getUint32(0, true)).toBe(GX_RESOURCE_MAGIC);
    });

    it('content length matches header total_size field', () => {
        const view       = new DataView(file.content.buffer);
        // GX_RESOURCE_HEADER layout: magic(4) version(2) theme_count(2) lang_count(2) total_size(4)
        const totalSize  = view.getUint32(10, true); // offset 10 = total_size
        expect(file.content.length).toBe(totalSize);
    });
});

// ---------------------------------------------------------------------------
// SREC format
// ---------------------------------------------------------------------------

describe('BinaryResourceGenerator — SREC format', () => {
    const project = createEmptyProject('SrecTest');
    project.displays[0].name = 'Display_1';
    const file = gen().generate(project, 0, BINARY_FORMAT_SREC);

    it('filename ends with .srec', () => {
        expect(file.filename).toMatch(/\.srec$/);
    });

    it('srec field is non-empty', () => {
        expect(file.srec.length).toBeGreaterThan(0);
    });

    it('srec starts with S0 record', () => {
        expect(file.srec.trimStart()).toMatch(/^S0/);
    });

    it('srec ends with S8 termination record', () => {
        expect(file.srec.trimEnd()).toMatch(/S8[0-9A-F]+$/);
    });

    it('S3 records have valid checksum length fields', () => {
        const s3Lines = file.srec.split('\n')
            .map(l => l.replace(/\r$/, ''))
            .filter(l => l.startsWith('S3'));
        expect(s3Lines.length).toBeGreaterThan(0);
        for (const line of s3Lines) {
            // S3: byte_count is the 3rd/4th hex chars; it encodes remaining bytes
            const byteCount = parseInt(line.slice(2, 4), 16);
            // Remaining hex chars after 'S3NN' = byteCount*2
            expect(line.length).toBe(4 + byteCount * 2);
        }
    });
});

// ---------------------------------------------------------------------------
// Multi-display uses compound filename
// ---------------------------------------------------------------------------

describe('BinaryResourceGenerator — multi-display filename', () => {
    const project = createEmptyProject('MultiApp');
    project.displays[0].name  = 'Display_1';
    project.displays[0].enabled = true;
    const { createDefaultDisplay } = require('../../src/common/project-model');
    project.displays[1] = createDefaultDisplay('Display_2');
    project.displays[1].enabled = true;

    const file0 = gen().generate(project, 0, BINARY_FORMAT_RAW);
    const file1 = gen().generate(project, 1, BINARY_FORMAT_RAW);

    it('display 0 filename contains both project and display names', () => {
        expect(file0.filename).toContain('MultiApp');
        expect(file0.filename).toContain('Display_1');
    });

    it('display 1 filename contains Display_2', () => {
        expect(file1.filename).toContain('Display_2');
    });

    it('two display filenames are distinct', () => {
        expect(file0.filename).not.toBe(file1.filename);
    });
});

// ---------------------------------------------------------------------------
// Big-endian flag flips byte order of magic
// ---------------------------------------------------------------------------

describe('BinaryResourceGenerator — big-endian project', () => {
    const project = createEmptyProject('BETest');
    project.header.big_endian = true;
    project.displays[0].name  = 'Display_1';
    const file = gen().generate(project, 0, BINARY_FORMAT_RAW);

    it('content starts with big-endian GX_RESOURCE_MAGIC', () => {
        const view = new DataView(file.content.buffer);
        expect(view.getUint32(0, false)).toBe(GX_RESOURCE_MAGIC);
    });
});

// ---------------------------------------------------------------------------
// Out-of-range display index throws
// ---------------------------------------------------------------------------

describe('BinaryResourceGenerator — error handling', () => {
    const project = createEmptyProject('ErrTest');

    it('throws for display index out of range', () => {
        expect(() => gen().generate(project, 99, BINARY_FORMAT_RAW)).toThrow();
    });
});
