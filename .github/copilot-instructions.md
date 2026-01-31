# Copilot instructions for Eclipse ThreadX GUIX

## Big picture
- `common/`: GUIX core runtime library (portable C). Public API is primarily `common/inc/gx_api.h`; implementation lives in `common/src/`.
- `ports/`: architecture/toolchain specific glue selected by CMake via `ports/${THREADX_ARCH}/${THREADX_TOOLCHAIN}`.
- `guix_studio/`: GUIX Studio (Windows/MFC) sources. Studio generates GUIX-compatible C code and binary resource outputs; see `guix_studio/resource_gen.cpp` and `guix_studio/binary_resource_gen.cpp`.
- `test/`: regression tests (notably `test/guix_test/`) driven by CMake + shell scripts; compares rendered output via golden files/checksums.

## Build (library)
- The root CMake build **requires** `THREADX_ARCH` and `THREADX_TOOLCHAIN` (set by toolchain files in `cmake/`, e.g. `cmake/cortex_m4.cmake`).
- Typical embedded build (example from repo docs):
  ```sh
  cmake -B build -GNinja -DCMAKE_TOOLCHAIN_FILE=cmake/cortex_m4.cmake .
  cmake --build build
  ```
- `guix` links against ThreadX as `azrtos::threadx`; when integrating, add ThreadX + GUIX as subdirectories and link your app to `azrtos::guix`.

## Feature/config switches (gx_user.h)
- GUIX feature macros are set via `gx_user.h`. CMake copies the chosen file into the build tree as `custom_inc/gx_user.h` and defines `GX_INCLUDE_USER_DEFINE_FILE`.
- If `GX_USER_FILE` is not set, the build uses `common/inc/gx_user_sample.h`.
- Prefer editing your source-controlled `gx_user.h` (or `common/inc/gx_user_sample.h` for experiments) rather than editing generated `build/**/custom_inc/gx_user.h`.

## CMake source lists
- `common/CMakeLists.txt` (and port CMakeLists) contain `# {{BEGIN_TARGET_SOURCES}}` / `# {{END_TARGET_SOURCES}}` markers. Keep edits to file lists within these regions and avoid unrelated reformatting (these sections are often tooling-managed).

## Tests (GUIX regression)
- Main harness: `test/guix_test/cmake/`. `run.sh` will clone ThreadX into that directory if missing and uses ThreadX’s `scripts/cmake_bootstrap.sh`.
- Run all tests (Linux-style workflow documented in `test/README.md`):
  ```sh
  cd test/guix_test/cmake
  ./run.sh build all
  ./run.sh run all
  ```
- Build types map to feature flags (e.g. `GX_DISABLE_UTF8_SUPPORT`, `GX_DISABLE_ERROR_CHECKING`, `GX_EXTENDED_UNICODE_SUPPORT`) via `test/guix_test/cmake/CMakeLists.txt`.

## GUIX Studio (Windows/MFC)
- Studio code is MFC-heavy (`CString`, `stdafx.h`, `studiox_includes.h`) and uses Windows path conventions (e.g. `"\\"` separators in output paths). Preserve these conventions when modifying Studio tooling.
- Resource generation and “no-gui” behaviors often branch on `GetCmdInfo()->IsNoGui()` and related flags (see `guix_studio/binary_resource_gen.cpp`).
