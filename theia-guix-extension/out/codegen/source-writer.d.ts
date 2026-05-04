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
export declare class SourceWriter {
    private lines;
    /** Emit a raw line with CRLF. */
    writeLine(text?: string): void;
    /** Emit a blank line. */
    blank(): void;
    /**
     * Emit a full-width comment banner.
     * Mirrors WriteCommentBlock() — identical top/bottom border,
     * text lines padded to COMMENT_END_COL with trailing end-comment sequence.
     */
    commentBanner(lines: string[]): void;
    /** Emit a single-line C block comment. */
    lineComment(text: string): void;
    /** `#include "file"` */
    include(file: string): void;
    /** `#include <file>` */
    includeSystem(file: string): void;
    /** `#define NAME VALUE` */
    define(name: string, value: string | number): void;
    /** `#ifndef NAME` */
    ifndefGuard(name: string): void;
    /** Emit endif with a trailing name comment. */
    endifGuard(name: string): void;
    /** `#if condition` */
    ifDirective(condition: string): void;
    /** `#endif` */
    endif(): void;
    /** `#error "msg"` */
    error(msg: string): void;
    /**
     * Emit a C array declaration.
     *
     * @param type     Full type string, e.g. `GX_CONST GX_COLOR`
     * @param name     Array name
     * @param values   Hex strings or identifiers (already formatted)
     * @param perRow   Items per line (default 8)
     */
    writeArray(type: string, name: string, values: string[], perRow?: number): void;
    /**
     * Emit a struct initialiser block.
     *
     * @param type   Type name
     * @param name   Variable name
     * @param fields Lines of field initialisers (without trailing commas)
     */
    writeStruct(type: string, name: string, fields: string[]): void;
    /**
     * Emit a line that has trailing inline comment at column COMMENT_START_COL.
     * Mirrors the C++ comment-alignment in studio_source_writer.
     *
     * @param code    Code text (will be padded to COMMENT_START_COL)
     * @param comment Comment text (without comment delimiters)
     */
    writeWithComment(code: string, comment: string): void;
    /** Emit `extern "C" {` guard. */
    externCOpen(): void;
    /** Emit extern-C close guard. */
    externCClose(): void;
    /** Return the complete file contents as a single string. */
    toString(): string;
    /** Reset to empty. */
    reset(): void;
}
/** Format a 32-bit integer as 0xAABBCCDD */
export declare function hex32(value: number): string;
/** Format a 16-bit integer as 0xAABB */
export declare function hex16(value: number): string;
/** Format an 8-bit integer as 0xAA */
export declare function hex8(value: number): string;
/** Convert a resource name to UPPER_CASE identifier (replaces spaces/hyphens with _). */
export declare function toMacroName(name: string): string;
/**
 * Emit the standard auto-generated file header comment block.
 * Text matches exactly what GUIX Studio C++ produces.
 */
export declare function writeFileHeader(writer: SourceWriter, studioVersion: string, date: Date): void;
//# sourceMappingURL=source-writer.d.ts.map