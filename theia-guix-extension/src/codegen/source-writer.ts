/**
 * SourceWriter — buffered line writer for C code generation.
 *
 * Ports studio_source_writer from guix_studio/screen_generator.cpp and
 * resource_gen.cpp.
 *
 * Mirrors the C++ behaviour:
 *   - Windows-style CRLF line endings
 *   - Inline comments aligned to column 45 (content) and 80 (close)
 *   - Integer/float formatting matching C printf specifiers
 *   - No external dependencies — pure string accumulation
 */

// ---------------------------------------------------------------------------
// Column constants (match C++ studio_source_writer)
// ---------------------------------------------------------------------------

const COMMENT_START_COL = 45;
const COMMENT_END_COL   = 80;
const CRLF              = '\r\n';

// ---------------------------------------------------------------------------
// SourceWriter
// ---------------------------------------------------------------------------

export class SourceWriter {

    private lines: string[] = [];

    // ── Primitive emit ─────────────────────────────────────────────────────

    /** Emit a raw line with CRLF. */
    writeLine(text = ''): void {
        this.lines.push(text + CRLF);
    }

    /** Emit a blank line. */
    blank(): void {
        this.writeLine();
    }

    // ── Comment helpers ────────────────────────────────────────────────────

    /**
     * Emit a full-width comment banner.
     * Mirrors WriteCommentBlock() — identical top/bottom border,
     * text lines padded to COMMENT_END_COL with trailing end-comment sequence.
     */
    commentBanner(lines: string[]): void {
        const width  = COMMENT_END_COL;
        const border = '/' + '*'.repeat(width - 1) + '/';
        this.writeLine(border);
        for (const text of lines) {
            const inner = '/*  ' + text;
            const padded = inner.padEnd(width - 2) + '*/';
            this.writeLine(padded);
        }
        this.writeLine(border);
    }

    /** Emit a single-line C block comment. */
    lineComment(text: string): void {
        this.writeLine('/* ' + text + ' */');
    }

    // ── C construct helpers ────────────────────────────────────────────────

    /** `#include "file"` */
    include(file: string): void {
        this.writeLine(`#include "${file}"`);
    }

    /** `#include <file>` */
    includeSystem(file: string): void {
        this.writeLine(`#include <${file}>`);
    }

    /** `#define NAME VALUE` */
    define(name: string, value: string | number): void {
        this.writeLine(`#define ${name} ${value}`);
    }

    /** `#ifndef NAME` */
    ifndefGuard(name: string): void {
        this.writeLine(`#ifndef ${name}`);
        this.writeLine(`#define ${name}`);
    }

    /** Emit endif with a trailing name comment. */
    endifGuard(name: string): void {
        this.writeLine(`#endif /* ${name} */`);
    }

    /** `#if condition` */
    ifDirective(condition: string): void {
        this.writeLine(`#if ${condition}`);
    }

    /** `#endif` */
    endif(): void {
        this.writeLine(`#endif`);
    }

    /** `#error "msg"` */
    error(msg: string): void {
        this.writeLine(`#error "${msg}"`);
    }

    // ── Array helpers ──────────────────────────────────────────────────────

    /**
     * Emit a C array declaration.
     *
     * @param type     Full type string, e.g. `GX_CONST GX_COLOR`
     * @param name     Array name
     * @param values   Hex strings or identifiers (already formatted)
     * @param perRow   Items per line (default 8)
     */
    writeArray(
        type: string,
        name: string,
        values: string[],
        perRow = 8,
    ): void {
        this.writeLine(`${type} ${name}[] =`);
        this.writeLine('{');
        for (let i = 0; i < values.length; i += perRow) {
            const chunk = values.slice(i, i + perRow);
            const isLast = i + perRow >= values.length;
            const row    = '    ' + chunk.join(', ') + (isLast ? '' : ',');
            this.writeLine(row);
        }
        this.writeLine('};');
        this.blank();
    }

    /**
     * Emit a struct initialiser block.
     *
     * @param type   Type name
     * @param name   Variable name
     * @param fields Lines of field initialisers (without trailing commas)
     */
    writeStruct(type: string, name: string, fields: string[]): void {
        this.writeLine(`${type} ${name} =`);
        this.writeLine('{');
        for (let i = 0; i < fields.length; i++) {
            const comma = i < fields.length - 1 ? ',' : '';
            this.writeLine('    ' + fields[i] + comma);
        }
        this.writeLine('};');
        this.blank();
    }

    // ── Inline-comment alignment ───────────────────────────────────────────

    /**
     * Emit a line that has trailing inline comment at column COMMENT_START_COL.
     * Mirrors the C++ comment-alignment in studio_source_writer.
     *
     * @param code    Code text (will be padded to COMMENT_START_COL)
     * @param comment Comment text (without comment delimiters)
     */
    writeWithComment(code: string, comment: string): void {
        const padded = code.padEnd(COMMENT_START_COL);
        const full   = padded + '/* ' + comment + ' */';
        this.writeLine(full);
    }

    // ── Header file helpers ────────────────────────────────────────────────

    /** Emit `extern "C" {` guard. */
    externCOpen(): void {
        this.writeLine('#ifdef __cplusplus');
        this.writeLine('extern "C" {');
        this.writeLine('#endif');
        this.blank();
    }

    /** Emit extern-C close guard. */
    externCClose(): void {
        this.blank();
        this.writeLine('#ifdef __cplusplus');
        this.writeLine('}');
        this.writeLine('#endif');
    }

    // ── Finalise ───────────────────────────────────────────────────────────

    /** Return the complete file contents as a single string. */
    toString(): string {
        return this.lines.join('');
    }

    /** Reset to empty. */
    reset(): void {
        this.lines = [];
    }
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by all generators)
// ---------------------------------------------------------------------------

/** Format a 32-bit integer as 0xAABBCCDD */
export function hex32(value: number): string {
    return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Format a 16-bit integer as 0xAABB */
export function hex16(value: number): string {
    return '0x' + (value & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/** Format an 8-bit integer as 0xAA */
export function hex8(value: number): string {
    return '0x' + (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

/** Convert a resource name to UPPER_CASE identifier (replaces spaces/hyphens with _). */
export function toMacroName(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_');
}

/**
 * Emit the standard auto-generated file header comment block.
 * Text matches exactly what GUIX Studio C++ produces.
 */
export function writeFileHeader(writer: SourceWriter, studioVersion: string, date: Date): void {
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh   = String(date.getHours()).padStart(2, '0');
    const min  = String(date.getMinutes()).padStart(2, '0');

    writer.commentBanner([
        'This file is auto-generated by Azure RTOS GUIX Studio. Do not edit this',
        'file by hand. Modifications to this file should only be made by running',
        'the Azure RTOS GUIX Studio application and re-generating the application',
        'specification file(s). For more information please refer to the Azure RTOS',
        'GUIX Studio User Guide, or visit our web site at azure.com/rtos',
        '',
        `GUIX Studio Revision ${studioVersion}`,
        `Date (dd.mm.yyyy): ${dd}.${mm}.${yyyy}  Time (hh:mm): ${hh}:${min}`,
    ]);
    writer.blank();
}
