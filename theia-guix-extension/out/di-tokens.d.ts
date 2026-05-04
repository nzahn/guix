/**
 * Dependency injection tokens for the GUIX Studio extension.
 * All DI symbols are exported from this single file so that every injector
 * site imports from one canonical location.
 *
 * Pattern: export const <ServiceName>Token = Symbol('<ServiceName>');
 */
export declare const GxpReaderToken: unique symbol;
export declare const GxpWriterToken: unique symbol;
export declare const UndoManagerToken: unique symbol;
export declare const ProjectModelToken: unique symbol;
export declare const CanvasControllerToken: unique symbol;
export declare const SnapEngineToken: unique symbol;
export declare const SelectionManagerToken: unique symbol;
export declare const PropertyPanelToken: unique symbol;
export declare const ResourcePanelToken: unique symbol;
export declare const ProjectViewToken: unique symbol;
export declare const ScreenFlowEditorToken: unique symbol;
export declare const ScreenGeneratorToken: unique symbol;
export declare const ResourceGeneratorToken: unique symbol;
export declare const BinaryResourceGeneratorToken: unique symbol;
export declare const StringTableToken: unique symbol;
export declare const WidgetRegistryToken: unique symbol;
export declare const LoggerToken: unique symbol;
//# sourceMappingURL=di-tokens.d.ts.map