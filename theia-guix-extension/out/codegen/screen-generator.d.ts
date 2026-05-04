/**
 * ScreenGenerator — emits *_specifications.c and *_specifications.h.
 *
 * Ports guix_studio/screen_generator.cpp.
 *
 * Key parity requirements:
 *   - Widget ID #define names: {SCREEN}_{WIDGET}_ID
 *   - Control block typedef per screen: {SCREEN_NAME}_PROPERTIES
 *   - Per-type GX_*_PROPERTIES struct fields match gx_studio_display_configure() API
 *   - Section order in .c: includes → widget control blocks → widget tables → display table
 *   - Section order in .h: guard → includes → IDs → typedefs → prototypes
 */
import { GxpProject } from '../common/project-model';
export interface SpecFiles {
    header: {
        filename: string;
        content: string;
    };
    source: {
        filename: string;
        content: string;
    };
}
export declare class ScreenGenerator {
    /**
     * Generate *_specifications.h + *_specifications.c for one display.
     *
     * @param project  Loaded project model
     * @param dispIdx  Index into project.displays
     */
    generate(project: GxpProject, dispIdx: number): SpecFiles;
    private generateHeader;
    private writeWidgetIds;
    private writeControlBlockTypedef;
    private writeChildMemberDecls;
    private generateSource;
    private writeWidgetProperties;
    private writeWidgetTable;
    private writeDisplayConfig;
}
//# sourceMappingURL=screen-generator.d.ts.map