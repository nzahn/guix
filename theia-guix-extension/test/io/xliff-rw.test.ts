/**
 * xliff-rw.test.ts — unit tests for the XLIFF 1.2 read/write helper.
 */

import { readXliff, writeXliff, XliffUnit } from '../../src/io/xliff-rw';

const SAMPLE_XLIFF = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="strings" source-language="en" target-language="fr" datatype="plaintext">
    <body>
      <trans-unit id="STRING_OK">
        <source>OK</source>
        <target>D'accord</target>
      </trans-unit>
      <trans-unit id="STRING_CANCEL">
        <source>Cancel</source>
        <target>Annuler</target>
      </trans-unit>
    </body>
  </file>
</xliff>`;

describe('readXliff', () => {
    it('parses all trans-units', () => {
        const units = readXliff(SAMPLE_XLIFF);
        expect(units).toHaveLength(2);
    });

    it('extracts id, source, and target', () => {
        const units = readXliff(SAMPLE_XLIFF);
        expect(units[0]).toEqual({ id: 'STRING_OK',     source: 'OK',     target: "D'accord" });
        expect(units[1]).toEqual({ id: 'STRING_CANCEL', source: 'Cancel', target: 'Annuler' });
    });

    it('returns empty array for a document with no trans-units', () => {
        const empty = `<?xml version="1.0"?><xliff version="1.2"><file><body></body></file></xliff>`;
        expect(readXliff(empty)).toHaveLength(0);
    });
});

describe('writeXliff', () => {
    it('produces a document that round-trips through readXliff', () => {
        const units: XliffUnit[] = [
            { id: 'STR_A', source: 'Hello', target: 'Bonjour' },
            { id: 'STR_B', source: 'World', target: 'Monde'   },
        ];
        const xml  = writeXliff(units, 'en', 'fr');
        const back = readXliff(xml);
        expect(back).toHaveLength(2);
        expect(back[0].id).toBe('STR_A');
        expect(back[0].target).toBe('Bonjour');
        expect(back[1].id).toBe('STR_B');
        expect(back[1].target).toBe('Monde');
    });

    it('includes the source and target language attributes', () => {
        const xml = writeXliff([], 'en', 'de');
        expect(xml).toContain('source-language');
        expect(xml).toContain('target-language');
    });
});
