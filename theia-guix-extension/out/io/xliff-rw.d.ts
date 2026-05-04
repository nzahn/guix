/**
 * XLIFF 1.2 read/write helpers.
 *
 * Ports guix_studio/xliff_read_write.cpp.
 *
 * The GUIX Studio XLIFF dialect:
 *   - Root element:  <xliff version="1.2">
 *   - One <file> per source→target language pair.
 *   - Each string becomes a <trans-unit id="STRING_ID_NAME">.
 *   - Source text lives in <source>, translated text in <target>.
 *
 * These are pure functions — they do not depend on any injected services.
 */
/** One translatable unit: id-name → translated text. */
export interface XliffUnit {
    id: string;
    source: string;
    target: string;
}
/**
 * Parse an XLIFF 1.2 document and return all trans-unit records.
 *
 * @param xml   Full XLIFF document text.
 * @returns     Array of units in document order.
 */
export declare function readXliff(xml: string): XliffUnit[];
/**
 * Serialize an array of XliffUnits to an XLIFF 1.2 document string.
 *
 * @param units          Translation units to serialize.
 * @param sourceLang     BCP-47 language tag for the source language (e.g. "en").
 * @param targetLang     BCP-47 language tag for the target language (e.g. "fr").
 * @param originalFile   Value for the <file original=""> attribute.
 */
export declare function writeXliff(units: ReadonlyArray<XliffUnit>, sourceLang: string, targetLang: string, originalFile?: string): string;
//# sourceMappingURL=xliff-rw.d.ts.map