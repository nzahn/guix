/**
 * StringTable — per-display multi-language string management.
 *
 * Ports guix_studio/string_table.cpp.
 *
 * The string table is stored in DisplayInfo.string_entries[].  This class
 * provides helper operations on top of that array:
 *   - Add / remove / find strings by ID name
 *   - Add / remove languages
 *   - Import from XLIFF / CSV (delegates to xliff-rw / csv-rw)
 *   - Generate the FontCharMap used by font subsetting
 *
 * NOTE: this class mutates DisplayInfo in place — callers are responsible for
 * wrapping mutations in UndoManager commands if undo/redo is required.
 */

import { injectable } from 'inversify';
import { DisplayInfo, StringEntry } from '../common/project-model';

// ---------------------------------------------------------------------------
// StringTable
// ---------------------------------------------------------------------------

@injectable()
export class StringTable {

    // ── Add / remove ─────────────────────────────────────────────────────────

    /**
     * Add a new empty string entry and return its 1-based string_id.
     * If a string with `idName` already exists, returns its existing id.
     */
    addString(disp: DisplayInfo, idName: string, numLanguages: number): number {
        const existing = this.findByIdName(disp, idName);
        if (existing) return existing.string_id;

        const nextId = disp.string_entries.length + 1; // 1-based
        const entry: StringEntry = {
            string_id:    nextId,
            name:         idName,
            translations: Array(numLanguages).fill(''),
        };
        disp.string_entries.push(entry);
        return nextId;
    }

    /**
     * Remove a string entry by id name.
     * Returns true if found and removed.
     */
    removeString(disp: DisplayInfo, idName: string): boolean {
        const idx = disp.string_entries.findIndex(e => e.name === idName);
        if (idx < 0) return false;
        disp.string_entries.splice(idx, 1);
        // Re-number remaining entries to keep IDs contiguous
        for (let i = idx; i < disp.string_entries.length; i++) {
            disp.string_entries[i].string_id = i + 1;
        }
        return true;
    }

    /**
     * Set the translation for one string + language.
     * Returns false if the entry or language index doesn't exist.
     */
    setTranslation(disp: DisplayInfo, idName: string, langIdx: number, text: string): boolean {
        const entry = this.findByIdName(disp, idName);
        if (!entry) return false;
        if (langIdx < 0 || langIdx >= entry.translations.length) return false;
        entry.translations[langIdx] = text;
        return true;
    }

    /**
     * Find a string entry by its resource ID name.
     */
    findByIdName(disp: DisplayInfo, idName: string): StringEntry | undefined {
        return disp.string_entries.find(e => e.name === idName);
    }

    /**
     * Find a string entry by its 1-based numeric string_id.
     */
    findById(disp: DisplayInfo, stringId: number): StringEntry | undefined {
        return disp.string_entries.find(e => e.string_id === stringId);
    }

    // ── Language operations ───────────────────────────────────────────────────

    /**
     * Append a new language column (empty translations) to every string entry.
     */
    addLanguage(disp: DisplayInfo): void {
        for (const entry of disp.string_entries) {
            entry.translations.push('');
        }
    }

    /**
     * Remove language at `langIdx` from every string entry.
     */
    removeLanguage(disp: DisplayInfo, langIdx: number): void {
        for (const entry of disp.string_entries) {
            entry.translations.splice(langIdx, 1);
        }
    }

    // ── Bulk import (from xliff-rw / csv-rw) ─────────────────────────────────

    /**
     * Merge an array of imported records into the table.
     *
     * `records` is `[{ idName, translations: string[] }]` — keyed by ID name,
     * translations indexed by language.  New strings are added; existing
     * strings have their translations updated column-by-column.
     *
     * @param srcLangIdx  Source language column in `records.translations`
     * @param dstLangIdx  Destination language column in disp.string_entries
     */
    importRecords(
        disp: DisplayInfo,
        records: ReadonlyArray<{ idName: string; translations: string[] }>,
        srcLangIdx: number,
        dstLangIdx: number,
        numLanguages: number,
    ): void {
        for (const rec of records) {
            let entry = this.findByIdName(disp, rec.idName);
            if (!entry) {
                this.addString(disp, rec.idName, numLanguages);
                entry = this.findByIdName(disp, rec.idName)!;
            }
            const text = rec.translations[srcLangIdx] ?? '';
            while (entry.translations.length <= dstLangIdx) {
                entry.translations.push('');
            }
            entry.translations[dstLangIdx] = text;
        }
    }

    // ── Font character map ────────────────────────────────────────────────────

    /**
     * Collect all unique Unicode code points used across all languages for
     * the given string IDs.  Used by font subsetting to determine which
     * glyphs need to be included.
     *
     * Returns a `Set<number>` of code points.
     */
    collectCodePoints(disp: DisplayInfo, stringIds: number[]): Set<number> {
        const points = new Set<number>();
        const idSet  = new Set(stringIds);

        for (const entry of disp.string_entries) {
            if (!idSet.has(entry.string_id)) continue;
            for (const text of entry.translations) {
                for (const char of text) {
                    points.add(char.codePointAt(0) ?? 0);
                }
            }
        }
        return points;
    }

    /**
     * Collect all code points for every string in the display (all languages).
     */
    collectAllCodePoints(disp: DisplayInfo): Set<number> {
        const ids = disp.string_entries.map(e => e.string_id);
        return this.collectCodePoints(disp, ids);
    }
}
