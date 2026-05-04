---
applyTo: "theia-guix-extension/src/io/gxp-serializer.ts"
---

# GXP Serializer Rules

- Schema version 56 (`PROJECT_VERSION`) is authoritative — read `guix_studio/StudioXProject.h`.
- Do NOT invent new XML elements or attributes.
- On read: apply version migration functions `migrateV<N>` in ascending version order.
- On write: attribute order must match the C++ writer exactly to keep `.gxp` diffs minimal.
- Use `DOMParser` (browser) or `@xmldom/xmldom` (Node); never use regex to parse XML.
- Validate the `version` attribute on open; surface a `GxpParseError` if `version > 56`.
