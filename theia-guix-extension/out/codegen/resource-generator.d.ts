/**
 * ResourceGenerator — emits *_resources.c and *_resources.h.
 *
 * Ports guix_studio/resource_gen.cpp.
 *
 * Key parity requirements (from guix-codegen.instructions.md):
 *   - Byte-for-byte output match with the C++ generator for the same .gxp input.
 *   - Section order: Color → Palette → Font → FontTable → Pixelmap → PixelmapTable
 *                    → Strings → LanguageTable → Themes → ThemeTable
 *   - Macro naming: GX_COLOR_ID_*, GX_FONT_ID_*, GX_PIXELMAP_ID_*, GX_STRING_ID_*
 *   - Windows CRLF line endings (handled by SourceWriter).
 */
import { GxpProject } from '../common/project-model';
export declare class GxCodegenError extends Error {
    constructor(message: string);
}
export interface GeneratedFile {
    filename: string;
    content: string;
}
export interface ResourceFiles {
    header: GeneratedFile;
    source: GeneratedFile;
}
export declare class ResourceGenerator {
    /**
     * Generate *_resources.h + *_resources.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project: GxpProject, dispIdx: number): ResourceFiles;
    private generateHeader;
    private writeResourceIds;
    private writeIdsForType;
    private writeStringIds;
    private generateSource;
    private writeColorTable;
    private writePalette;
    private writeFontTable;
    private writePixelmapTable;
    private writePixelmapStruct;
    private writeThemeStruct;
    private writeScrollbarAppearance;
    private writeThemeTable;
    private writeLanguageTables;
    private writeStringTableForLanguage;
}
//# sourceMappingURL=resource-generator.d.ts.map