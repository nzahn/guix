/**
 * string-table.test.ts — unit tests for StringTable.
 */

import { StringTable } from '../../src/i18n/string-table';
import { createDefaultDisplay } from '../../src/common/project-model';
import type { DisplayInfo } from '../../src/common/project-model';

function makeDisplay(): DisplayInfo {
    const d = createDefaultDisplay('TestDisplay');
    return d;
}

function make(): StringTable {
    return new StringTable();
}

// ---------------------------------------------------------------------------
// addString
// ---------------------------------------------------------------------------

describe('StringTable.addString', () => {
    it('adds a new string and returns 1-based ID', () => {
        const d  = makeDisplay();
        const st = make();
        const id = st.addString(d, 'STR_OK', 1);
        expect(id).toBe(1);
        expect(d.string_entries).toHaveLength(1);
    });

    it('returns existing ID if the name already exists', () => {
        const d  = makeDisplay();
        const st = make();
        const id1 = st.addString(d, 'STR_OK', 1);
        const id2 = st.addString(d, 'STR_OK', 1);
        expect(id1).toBe(id2);
        expect(d.string_entries).toHaveLength(1);
    });

    it('assigns sequential IDs', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 1);
        const id2 = st.addString(d, 'STR_B', 1);
        expect(id2).toBe(2);
    });

    it('initialises translations with empty strings', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 3);
        expect(d.string_entries[0].translations).toHaveLength(3);
        expect(d.string_entries[0].translations.every(t => t === '')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// removeString
// ---------------------------------------------------------------------------

describe('StringTable.removeString', () => {
    it('removes an existing entry', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 1);
        const removed = st.removeString(d, 'STR_A');
        expect(removed).toBe(true);
        expect(d.string_entries).toHaveLength(0);
    });

    it('returns false for a non-existent entry', () => {
        const d  = makeDisplay();
        const st = make();
        expect(st.removeString(d, 'NO_SUCH')).toBe(false);
    });

    it('re-numbers remaining entries after removal', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 1);
        st.addString(d, 'STR_B', 1);
        st.addString(d, 'STR_C', 1);
        st.removeString(d, 'STR_A');
        // STR_B should now be id=1, STR_C should be id=2
        expect(d.string_entries[0].string_id).toBe(1);
        expect(d.string_entries[1].string_id).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// setTranslation / findByIdName
// ---------------------------------------------------------------------------

describe('StringTable.setTranslation', () => {
    it('sets a translation for the given language', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_HI', 2);
        st.setTranslation(d, 'STR_HI', 0, 'Hello');
        st.setTranslation(d, 'STR_HI', 1, 'Bonjour');
        const entry = st.findByIdName(d, 'STR_HI')!;
        expect(entry.translations[0]).toBe('Hello');
        expect(entry.translations[1]).toBe('Bonjour');
    });

    it('returns false for unknown string name', () => {
        const d  = makeDisplay();
        const st = make();
        expect(st.setTranslation(d, 'NOPE', 0, 'x')).toBe(false);
    });

    it('returns false for out-of-range language index', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 1);
        expect(st.setTranslation(d, 'STR_A', 5, 'x')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// addLanguage / removeLanguage
// ---------------------------------------------------------------------------

describe('StringTable language operations', () => {
    it('addLanguage appends an empty column to all entries', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 1);
        st.addLanguage(d);
        expect(d.string_entries[0].translations).toHaveLength(2);
    });

    it('removeLanguage removes the column from all entries', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 2);
        st.setTranslation(d, 'STR_A', 0, 'Hello');
        st.setTranslation(d, 'STR_A', 1, 'Bonjour');
        st.removeLanguage(d, 0);
        const entry = st.findByIdName(d, 'STR_A')!;
        expect(entry.translations).toHaveLength(1);
        expect(entry.translations[0]).toBe('Bonjour');
    });
});

// ---------------------------------------------------------------------------
// collectCodePoints
// ---------------------------------------------------------------------------

describe('StringTable.collectAllCodePoints', () => {
    it('collects unique code points across all translations', () => {
        const d  = makeDisplay();
        const st = make();
        st.addString(d, 'STR_A', 2);
        st.setTranslation(d, 'STR_A', 0, 'AB');
        st.setTranslation(d, 'STR_A', 1, 'BC');
        const pts = st.collectAllCodePoints(d);
        expect(pts.has('A'.codePointAt(0)!)).toBe(true);
        expect(pts.has('B'.codePointAt(0)!)).toBe(true);
        expect(pts.has('C'.codePointAt(0)!)).toBe(true);
        expect(pts.size).toBe(3);
    });
});
