/**
 * csv-rw.test.ts — unit tests for the CSV read/write helper.
 */

import { readCsv, writeCsv } from '../../src/io/csv-rw';

describe('readCsv', () => {
    it('parses simple unquoted fields', () => {
        const rows = readCsv('a,b,c\r\n1,2,3\r\n');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(['a', 'b', 'c']);
        expect(rows[1]).toEqual(['1', '2', '3']);
    });

    it('parses quoted fields containing commas', () => {
        const rows = readCsv('"hello, world",foo\r\n');
        expect(rows[0]).toEqual(['hello, world', 'foo']);
    });

    it('parses escaped double-quotes inside quoted fields', () => {
        const rows = readCsv('"say ""hi""",ok\r\n');
        expect(rows[0]).toEqual(['say "hi"', 'ok']);
    });

    it('handles LF-only line endings', () => {
        const rows = readCsv('x,y\nz,w\n');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(['x', 'y']);
        expect(rows[1]).toEqual(['z', 'w']);
    });

    it('returns empty array for empty input', () => {
        expect(readCsv('')).toHaveLength(0);
    });
});

describe('writeCsv', () => {
    it('serializes plain rows with CRLF line endings', () => {
        const text = writeCsv([['a', 'b'], ['1', '2']]);
        expect(text).toBe('a,b\r\n1,2');
    });

    it('quotes fields that contain commas', () => {
        const text = writeCsv([['hello, world', 'ok']]);
        expect(text).toBe('"hello, world",ok');
    });

    it('escapes double-quotes inside quoted fields', () => {
        const text = writeCsv([['say "hi"', 'ok']]);
        expect(text).toBe('"say ""hi""",ok');
    });

    it('round-trips through readCsv', () => {
        const original = [
            ['STRING_ID_1', '', 'Hello World'],
            ['STRING_ID_2', 'A note', 'Goodbye, World'],
            ['STRING_ID_3', '', 'She said "hello"'],
        ];
        const csv  = writeCsv(original);
        const back = readCsv(csv + '\r\n');
        expect(back).toEqual(original);
    });
});
