/**
 * GXP project file writer.
 *
 * Mirrors StudioXProject::Save(), WriteProjectHeader(), WriteDisplayInfo(),
 * WriteResources(), WriteOneResource(), WriteStringTable(), WriteScreenFlow(),
 * WriteWidgetFolders() and widget_service_provider::WriteToProject() from the
 * C++ GUIX Studio source.
 *
 * Attribute order and indentation match the C++ writer exactly so that diffs
 * between a file saved by GUIX Studio and by this writer are minimal.
 */
import 'reflect-metadata';
import type { GxpProject } from '../common/project-model';
export declare class GxpWriteError extends Error {
    constructor(message: string);
}
export declare class GxpWriter {
    /**
     * Serialise a `GxpProject` to a `.gxp` XML string.
     *
     * The output matches the C++ xml_writer output byte-for-byte in terms of
     * element structure and order.  Indentation uses 4 spaces per level to
     * match the C++ OpenTag() behaviour.
     */
    writeProject(project: GxpProject): string;
    private writeProjectHeader;
    private writeDisplayInfo;
    private writeThemeScrollbars;
    private writeScrollbarAppearance;
    private writeThemePaletteInfo;
    private writeResources;
    private writeOneResource;
    private writePaletteType;
    private writeStringTable;
    private writeScreenFlow;
    private writeTriggerInfo;
    private writeActionInfo;
    private writeWidgetFolders;
    private writeWidgets;
    /**
     * Write one widget's base fields (mirrors widget_service_provider::WriteToProject).
     * Widget-type-specific fields are written by the WidgetService implementations.
     */
    private writeOneWidget;
}
//# sourceMappingURL=gxp-writer.d.ts.map