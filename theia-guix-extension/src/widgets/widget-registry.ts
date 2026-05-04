/**
 * WidgetRegistry — maps GX_TYPE_* integer constants to WidgetService instances.
 *
 * Ports guix_studio/widget_factory.cpp (GetServiceProvider / InitServiceProviders).
 *
 * Usage:
 *   const svc = registry.getService(GX_TYPE_BUTTON);   // ButtonService
 *   const all = registry.allTypes();                     // [128, 1, 2, ...]
 */

import { injectable } from 'inversify';
import { WidgetService } from './widget-service';
import {
    WidgetServiceBase,
    WindowService,
    RootWindowService,
    ButtonService,
    TextButtonService,
    MultiLineTextButtonService,
    CheckboxService,
    RadioButtonService,
    IconButtonService,
    PixelmapButtonService,
    IconService,
    SpriteService,
    CircularGaugeService,
    ProgressBarService,
    RadialProgressBarService,
    PromptService,
    NumericPromptService,
    PixelmapPromptService,
    NumericPixelmapPromptService,
    SingleLineTextInputService,
    MultiLineTextInputService,
    MultiLineTextViewService,
    RichTextViewService,
    VerticalListService,
    HorizontalListService,
    DropListService,
    GenericScrollWheelService,
    StringScrollWheelService,
    NumericScrollWheelService,
    TemplateService,
    HorizontalScrollbarService,
    VerticalScrollbarService,
    SliderService,
    PixelmapSliderService,
    RadialSliderService,
    LineChartService,
    MenuService,
    AccordionMenuService,
    TreeViewService,
} from './widget-service';

@injectable()
export class WidgetRegistry {

    private readonly byType = new Map<number, WidgetService>();

    constructor() {
        const services: WidgetService[] = [
            new WidgetServiceBase(),
            new WindowService(),
            new RootWindowService(),
            new ButtonService(),
            new TextButtonService(),
            new MultiLineTextButtonService(),
            new CheckboxService(),
            new RadioButtonService(),
            new IconButtonService(),
            new PixelmapButtonService(),
            new IconService(),
            new SpriteService(),
            new CircularGaugeService(),
            new ProgressBarService(),
            new RadialProgressBarService(),
            new PromptService(),
            new NumericPromptService(),
            new PixelmapPromptService(),
            new NumericPixelmapPromptService(),
            new SingleLineTextInputService(),
            new MultiLineTextInputService(),
            new MultiLineTextViewService(),
            new RichTextViewService(),
            new VerticalListService(),
            new HorizontalListService(),
            new DropListService(),
            new GenericScrollWheelService(),
            new StringScrollWheelService(),
            new NumericScrollWheelService(),
            new TemplateService(),
            new HorizontalScrollbarService(),
            new VerticalScrollbarService(),
            new SliderService(),
            new PixelmapSliderService(),
            new RadialSliderService(),
            new LineChartService(),
            new MenuService(),
            new AccordionMenuService(),
            new TreeViewService(),
        ];

        for (const svc of services) {
            this.register(svc);
        }
    }

    /**
     * Return the WidgetService for `type`.
     * Falls back to WidgetServiceBase for unknown types.
     */
    getService(type: number): WidgetService {
        return this.byType.get(type) ?? this.byType.get(0)!;
    }

    /**
     * Register a WidgetService.  Replaces any previously registered service
     * for the same type (allows user-extension at runtime).
     */
    register(service: WidgetService): void {
        this.byType.set(service.getType(), service);
    }

    /** Return all registered GX_TYPE_* integers in insertion order. */
    allTypes(): number[] {
        return [...this.byType.keys()];
    }

    /**
     * Return the control-block C type name for a given GX_TYPE_* value,
     * e.g. getControlBlockName(GX_TYPE_BUTTON) → "GX_BUTTON".
     */
    getControlBlockName(type: number): string {
        return this.getService(type).getControlBlockName();
    }

    /**
     * Return the short name used in code generation, e.g. "button".
     */
    getShortName(type: number): string {
        return this.getService(type).getShortName();
    }
}
