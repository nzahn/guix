# Negative smoke test for `guix_studio_cli generate --binary` missing pixelmap assets.
#
# Verifies we fail fast with an actionable, path-specific error when a required
# pixelmap source file is missing.

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

# Copy the project and intentionally break one pixelmap pathname.
get_filename_component(PROJECT_NAME "${GUIX_PROJECT}" NAME)
set(bad_project "${OUT_DIR}/${PROJECT_NAME}")
file(COPY_FILE "${GUIX_PROJECT}" "${bad_project}")

file(READ "${bad_project}" gxp)
# Replace the first occurrence of a known asset reference.
string(REPLACE "graphics\\radiobutton_on.png" "graphics\\__MISSING__radiobutton_on.png" gxp "${gxp}")
file(WRITE "${bad_project}" "${gxp}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${bad_project}" --output_path "${OUT_DIR}" --binary --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(rv EQUAL 0)
  message(FATAL_ERROR "Expected generate --binary to fail for missing asset, but it succeeded.\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

# Ensure the error is actionable and references missing pixelmap assets.
if(NOT err MATCHES "Missing pixelmap source asset")
  message(FATAL_ERROR "Expected missing-asset error.\nrv=${rv}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()
