/**
 * Dependency injection tokens for the GUIX Studio extension.
 * All DI symbols are exported from this single file so that every injector
 * site imports from one canonical location.
 *
 * Pattern: export const <ServiceName>Token = Symbol('<ServiceName>');
 */

export const GxpReaderToken = Symbol('GxpReader');
export const GxpWriterToken = Symbol('GxpWriter');
export const UndoManagerToken = Symbol('UndoManager');
export const ProjectModelToken = Symbol('ProjectModel');
export const CanvasControllerToken = Symbol('CanvasController');
export const SnapEngineToken = Symbol.for('SnapEngine');
export const SelectionManagerToken = Symbol.for('SelectionManager');
export const PropertyPanelToken = Symbol('PropertyPanel');
export const ResourcePanelToken = Symbol('ResourcePanel');
export const ProjectViewToken = Symbol('ProjectView');
export const ScreenFlowEditorToken = Symbol('ScreenFlowEditor');
export const ScreenGeneratorToken = Symbol('ScreenGenerator');
export const ResourceGeneratorToken = Symbol('ResourceGenerator');
export const BinaryResourceGeneratorToken = Symbol('BinaryResourceGenerator');
export const StringTableToken = Symbol('StringTable');
export const WidgetRegistryToken = Symbol('WidgetRegistry');
export const LoggerToken = Symbol('Logger');
