/**
 * CSV read/write helpers.
 *
 * Ports guix_studio/csv_read_write.cpp.
 *
 * Column layout (matches C++ output):
 *   Column 0: String ID name
 *   Column 1: Notes
 *   Columns 2…N: One column per language, in language order
 *
 * Quoting rules (RFC 4180):
 *   - Fields containing commas, double-quotes, or newlines are enclosed in
 *     double-quotes.
 *   - A double-quote inside a quoted field is escaped as two double-quotes.
 *
 * These are pure functions — they do not depend on any injected services.
 */
/**
 * One row in the string table CSV export.
 * First element is the string ID, second is the note/comment,
 * remaining elements are translations indexed by language.
 */
export type CsvRow = string[];
/**
 * Parse a CSV string and return a 2-D array of field values.
 * Handles RFC 4180 quoting including embedded newlines in quoted fields.
 *
 * @param text  Raw CSV text (LF or CRLF line endings).
 * @returns     Array of rows; each row is an array of field strings.
 */
export declare function readCsv(text: string): CsvRow[];
/**
 * Serialize a 2-D array of field values to a CSV string.
 * Uses CRLF line endings (matches C++ GUIX Studio output).
 *
 * @param rows  2-D array produced by readCsv or constructed manually.
 * @returns     RFC 4180 CSV text with CRLF line endings.
 */
export declare function writeCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string;
//# sourceMappingURL=csv-rw.d.ts.map