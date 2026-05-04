/**
 * WidgetRegistry — maps GX_TYPE_* integer constants to WidgetService instances.
 *
 * Ports guix_studio/widget_factory.cpp (GetServiceProvider / InitServiceProviders).
 *
 * Usage:
 *   const svc = registry.getService(GX_TYPE_BUTTON);   // ButtonService
 *   const all = registry.allTypes();                     // [128, 1, 2, ...]
 */
import { WidgetService } from './widget-service';
export declare class WidgetRegistry {
    private readonly byType;
    constructor();
    /**
     * Return the WidgetService for `type`.
     * Falls back to WidgetServiceBase for unknown types.
     */
    getService(type: number): WidgetService;
    /**
     * Register a WidgetService.  Replaces any previously registered service
     * for the same type (allows user-extension at runtime).
     */
    register(service: WidgetService): void;
    /** Return all registered GX_TYPE_* integers in insertion order. */
    allTypes(): number[];
    /**
     * Return the control-block C type name for a given GX_TYPE_* value,
     * e.g. getControlBlockName(GX_TYPE_BUTTON) → "GX_BUTTON".
     */
    getControlBlockName(type: number): string;
    /**
     * Return the short name used in code generation, e.g. "button".
     */
    getShortName(type: number): string;
}
//# sourceMappingURL=widget-registry.d.ts.map