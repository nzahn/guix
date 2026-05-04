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
import { DisplayInfo, StringEntry } from '../common/project-model';
export declare class StringTable {
    /**
     * Add a new empty string entry and return its 1-based string_id.
     * If a string with `idName` already exists, returns its existing id.
     */
    addString(disp: DisplayInfo, idName: string, numLanguages: number): number;
    /**
     * Remove a string entry by id name.
     * Returns true if found and removed.
     */
    removeString(disp: DisplayInfo, idName: string): boolean;
    /**
     * Set the translation for one string + language.
     * Returns false if the entry or language index doesn't exist.
     */
    setTranslation(disp: DisplayInfo, idName: string, langIdx: number, text: string): boolean;
    /**
     * Find a string entry by its resource ID name.
     */
    findByIdName(disp: DisplayInfo, idName: string): StringEntry | undefined;
    /**
     * Find a string entry by its 1-based numeric string_id.
     */
    findById(disp: DisplayInfo, stringId: number): StringEntry | undefined;
    /**
     * Append a new language column (empty translations) to every string entry.
     */
    addLanguage(disp: DisplayInfo): void;
    /**
     * Remove language at `langIdx` from every string entry.
     */
    removeLanguage(disp: DisplayInfo, langIdx: number): void;
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
    importRecords(disp: DisplayInfo, records: ReadonlyArray<{
        idName: string;
        translations: string[];
    }>, srcLangIdx: number, dstLangIdx: number, numLanguages: number): void;
    /**
     * Collect all unique Unicode code points used across all languages for
     * the given string IDs.  Used by font subsetting to determine which
     * glyphs need to be included.
     *
     * Returns a `Set<number>` of code points.
     */
    collectCodePoints(disp: DisplayInfo, stringIds: number[]): Set<number>;
    /**
     * Collect all code points for every string in the display (all languages).
     */
    collectAllCodePoints(disp: DisplayInfo): Set<number>;
}
//# sourceMappingURL=string-table.d.ts.map