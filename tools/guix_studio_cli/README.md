# guix_studio_cli (Phase 1)

This is a small, cross-platform CLI intended to become the portable backend for a GUIX Studio VS Code extension.

## Build

```sh
cmake -S tools/guix_studio_cli -B build/guix_studio_cli
cmake --build build/guix_studio_cli
```

## Usage

```sh
# Basic validation
./build/guix_studio_cli/guix_studio_cli validate --project samples/demo_guix_simple/guix_simple.gxp

# Project summary (human)
./build/guix_studio_cli/guix_studio_cli summary --project samples/demo_guix_simple/guix_simple.gxp

# Project summary (JSON)
./build/guix_studio_cli/guix_studio_cli summary --project samples/demo_guix_simple/guix_simple.gxp --json

# Phase 1 generation: export a resource-project XML
./build/guix_studio_cli/guix_studio_cli generate \
	--project samples/demo_guix_simple/guix_simple.gxp \
	--output_path /tmp/guix_out
```

## Scope

Phase 1 supports best-effort summaries, minimal validation, and a minimal generator (`generate`) that exports a resource-project XML.
Later phases will implement output generation compatible with legacy Studio (resource/spec/bin/srec/standalone binres).

Note: legacy Studio expects the resource-project XML `<version>` to be at least 56. The CLI clamps the exported resource XML version to `>= 56` even if the `.gxp` has an older `<project_version>` (e.g. 55).
