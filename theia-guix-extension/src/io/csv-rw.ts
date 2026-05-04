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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One row in the string table CSV export.
 * First element is the string ID, second is the note/comment,
 * remaining elements are translations indexed by language.
 */
export type CsvRow = string[];

// ---------------------------------------------------------------------------
// readCsv
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string and return a 2-D array of field values.
 * Handles RFC 4180 quoting including embedded newlines in quoted fields.
 *
 * @param text  Raw CSV text (LF or CRLF line endings).
 * @returns     Array of rows; each row is an array of field strings.
 */
export function readCsv(text: string): CsvRow[] {
    const rows: CsvRow[] = [];
    let pos = 0;
    const len = text.length;

    while (pos < len) {
        const row: string[] = [];

        // Parse one row
        while (pos <= len) {
            // End-of-input
            if (pos === len) {
                row.push('');
                rows.push(row);
                return rows;
            }

            if (text[pos] === '"') {
                // Quoted field
                pos++; // skip opening quote
                let field = '';
                while (pos < len) {
                    if (text[pos] === '"') {
                        if (pos + 1 < len && text[pos + 1] === '"') {
                            field += '"';
                            pos += 2;
                        } else {
                            pos++; // skip closing quote
                            break;
                        }
                    } else {
                        field += text[pos++];
                    }
                }
                row.push(field);
            } else {
                // Unquoted field — read until comma or end-of-line
                let field = '';
                while (pos < len && text[pos] !== ',' && text[pos] !== '\n' && text[pos] !== '\r') {
                    field += text[pos++];
                }
                row.push(field);
            }

            // After field: comma → next field; CRLF/LF/end → next row
            if (pos < len && text[pos] === ',') {
                pos++; // consume comma
            } else {
                // Row delimiter
                if (pos < len && text[pos] === '\r') pos++; // skip \r
                if (pos < len && text[pos] === '\n') pos++; // skip \n
                if (row.length > 0) rows.push(row);
                break;
            }
        }
    }

    return rows;
}

// ---------------------------------------------------------------------------
// writeCsv
// ---------------------------------------------------------------------------

/**
 * Serialize a 2-D array of field values to a CSV string.
 * Uses CRLF line endings (matches C++ GUIX Studio output).
 *
 * @param rows  2-D array produced by readCsv or constructed manually.
 * @returns     RFC 4180 CSV text with CRLF line endings.
 */
export function writeCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
    const lines: string[] = [];
    for (const row of rows) {
        const fields = row.map(quoteCsvField);
        lines.push(fields.join(','));
    }
    return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function quoteCsvField(value: string): string {
    // Must quote if the value contains a comma, double-quote, newline, or
    // carriage return.
    if (value.includes('"') || value.includes(',') ||
        value.includes('\n') || value.includes('\r')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}
