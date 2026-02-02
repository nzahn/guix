# Smoke test for `guix_studio_cli generate` with legacy-style flags that omit filenames.
# Mirrors Studio behavior where `-r`/`-s` can be passed without an explicit name.

if(NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "GUIX_STUDIO_CLI not set")
endif()
if(NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "GUIX_PROJECT not set")
endif()
if(NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "OUT_DIR not set")
endif()

file(REMOVE_RECURSE "${OUT_DIR}")
file(MAKE_DIRECTORY "${OUT_DIR}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" -r -s --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "generate failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

get_filename_component(project_stem "${GUIX_PROJECT}" NAME_WE)

# Ensure resource/spec stubs exist with default naming.
set(resource_c "${OUT_DIR}/${project_stem}_resources.c")
set(resource_h "${OUT_DIR}/${project_stem}_resources.h")
set(spec_c "${OUT_DIR}/${project_stem}_specifications.c")
set(spec_h "${OUT_DIR}/${project_stem}_specifications.h")

foreach(p IN LISTS resource_c resource_h spec_c spec_h)
  if(NOT EXISTS "${p}")
    message(FATAL_ERROR "Expected output not created: ${p}\nstdout:\n${out}\nstderr:\n${err}\n")
  endif()
endforeach()
