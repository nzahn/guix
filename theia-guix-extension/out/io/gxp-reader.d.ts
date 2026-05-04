/**
 * GXP project file reader.
 *
 * Ports StudioXProject::Read(), ReadProjectHeader(), ReadDisplayInfo(),
 * ReadResources(), ReadStringTable(), ReadScreenFlow(), ReadWidgetFolders()
 * and the base widget_service_provider::ReadFromProject() from the C++ GUIX
 * Studio source.
 *
 * Uses @xmldom/xmldom for XML parsing (no regex, no native add-ons).
 * Schema version 56 (PROJECT_VERSION) is the canonical target; older versions
 * are migrated forward automatically.
 */
import 'reflect-metadata';
import type { GxpProject } from '../common/project-model';
export declare class GxpParseError extends Error {
    constructor(message: string);
}
export declare class GxpReader {
    /**
     * Parse a `.gxp` XML file and return the in-memory project model.
     *
     * @param xmlContent  Raw UTF-8 text of the `.gxp` file.
     * @param filePath    Absolute path to the file (for error messages and
     *                    relative-path resolution).
     */
    readProject(xmlContent: string, filePath: string): GxpProject;
    private readProjectHeader;
    private readDisplayInfo;
    private readThemeScrollbars;
    private readScrollbarAppearance;
    private readThemePaletteInfo;
    private readResources;
    private readOneResource;
    private readPaletteType;
    private parseColorFormatName;
    private readStringTable;
    private readScreenFlow;
    private readTriggerInfo;
    private readActionInfo;
    private readWidgetFolders;
    private readWidgets;
    private readChildWidgets;
    /**
     * Read one widget from the "widget" section.
     * Mirrors widget_reader::ReadOneWidget() + widget_service_provider::ReadFromProject().
     */
    private readOneWidget;
    /**
     * Read a resource ID field.  Version > 52: stored as a resource name string.
     * Version ≤ 52: stored as a raw unsigned integer.
     */
    private readResourceId;
    private makeDefaultProjectHeader;
    private makeDefaultDisplayInfo;
    private makeDefaultScrollbarAppearance;
}
//# sourceMappingURL=gxp-reader.d.ts.map