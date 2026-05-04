---
applyTo: "theia-guix-extension/src/codegen/**/*.ts"
---

# Code Generation Rules

- **Primary acceptance criterion**: byte-for-byte output parity with the C++ GUIX Studio generators.
- Before touching a generator file, read the corresponding C++ source in `guix_studio/`.
- Preserve exact comment block text, indentation (4 spaces in C arrays), and macro naming conventions.
- Use `SourceWriter` for all output — never concatenate strings directly to a file handle.
- Float/integer formatting must match C++ `printf` format specifiers. Use `toFixed()` only when
  the C++ uses `%.Nf`; use `toString()` for integers.
- Add a golden-file test for every new generator path you implement.
