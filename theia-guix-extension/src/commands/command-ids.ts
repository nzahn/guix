/**
 * Command ID string constants — mirrors the GUIX Studio command system.
 * All VS Code `commands.registerCommand` calls use these string IDs.
 */

export const COMMAND_GENERATE_CODE    = 'guixStudio.generateCode';
export const COMMAND_GENERATE_BINARY  = 'guixStudio.generateBinary';
export const COMMAND_UNDO             = 'guixStudio.undo';
export const COMMAND_REDO             = 'guixStudio.redo';
export const COMMAND_ADD_DISPLAY      = 'guixStudio.addDisplay';
export const COMMAND_SELECT_DISPLAY   = 'guixStudio.selectDisplay';
export const COMMAND_SELECT_THEME     = 'guixStudio.selectTheme';

// Widget tree operations
export const COMMAND_ADD_SCREEN       = 'guixStudio.addScreen';
export const COMMAND_ADD_FOLDER       = 'guixStudio.addFolder';
export const COMMAND_DELETE_WIDGET    = 'guixStudio.deleteWidget';
export const COMMAND_RENAME_WIDGET    = 'guixStudio.renameWidget';
export const COMMAND_COPY_WIDGET      = 'guixStudio.copyWidget';
export const COMMAND_PASTE_WIDGET     = 'guixStudio.pasteWidget';

// Resource operations
export const COMMAND_ADD_COLOR        = 'guixStudio.addColor';
export const COMMAND_ADD_FONT         = 'guixStudio.addFont';
export const COMMAND_ADD_PIXELMAP     = 'guixStudio.addPixelmap';
export const COMMAND_ADD_STRING       = 'guixStudio.addString';
export const COMMAND_EDIT_RESOURCE    = 'guixStudio.editResource';
export const COMMAND_DELETE_RESOURCE  = 'guixStudio.deleteResource';

// String table operations
export const COMMAND_IMPORT_STRINGS   = 'guixStudio.importStrings';
export const COMMAND_EXPORT_STRINGS   = 'guixStudio.exportStrings';

// Screen flow
export const COMMAND_ADD_TRIGGER      = 'guixStudio.addTrigger';
export const COMMAND_DELETE_TRIGGER   = 'guixStudio.deleteTrigger';
