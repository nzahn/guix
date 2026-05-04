---
applyTo: "theia-guix-extension/src/**/*.ts"
---

# TypeScript Coding Rules — GUIX Studio Theia Extension

## Strict TypeScript

- `strict: true` is enforced; no `any`, no `@ts-ignore`.
- All function parameters and return types must be explicitly typed.
- Use `unknown` instead of `any` at system boundaries; narrow with type guards.

## Theia DI Pattern

- Injectable services use `@injectable()` + `@inject(TOKEN)` from `inversify`.
- Export each DI symbol from `src/di-tokens.ts`:
  ```ts
  export const UndoManagerToken = Symbol('UndoManager');
  ```
- Never use `new ServiceClass()` directly — always inject or use a factory.

## Immutability

- `WidgetInfo` and `ResInfo` objects in the project model are treated as immutable outside of
  command `execute()` / `undo()` methods.
- Use `structuredClone()` or spread operators to produce modified copies in commands.

## GX Constants

- All `GX_TYPE_*`, `GX_COLOR_FORMAT_*`, `GX_STYLE_*` constants live in `src/common/gx-types.ts`.
- Never hardcode raw integer values for GX constants; always import and use the named constant.

## File Organization

- One class/interface per file (exceptions: small related helpers in the same file).
- Barrel exports (`index.ts`) at folder boundaries only where needed.

## Error Handling

- Throw `GxpParseError` (extends `Error`) for malformed `.gxp` XML.
- Throw `GxCodegenError` for code generation failures.
- Log with Theia `ILogger` service — never `console.log` in production paths.
