# Compare guix_studio_cli migrate output to a committed golden file.
#
# Required variables:
#  - GUIX_STUDIO_CLI: path to the guix_studio_cli executable
#  - GUIX_PROJECT: path to a .gxp project
#  - OUT_DIR: output directory
#  - GOLDEN_GXP: path to golden migrated .gxp file

if(NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "Missing required -DGUIX_STUDIO_CLI")
endif()
if(NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "Missing required -DGUIX_PROJECT")
endif()
if(NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "Missing required -DOUT_DIR")
endif()
if(NOT DEFINED GOLDEN_GXP)
  message(FATAL_ERROR "Missing required -DGOLDEN_GXP")
endif()

file(MAKE_DIRECTORY "${OUT_DIR}")

get_filename_component(PROJ_BASE "${GUIX_PROJECT}" NAME_WE)
if(PROJ_BASE STREQUAL "")
  set(PROJ_BASE "project")
endif()

set(actual_gxp "${OUT_DIR}/${PROJ_BASE}.migrated.gxp")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" migrate --project "${GUIX_PROJECT}" --output "${actual_gxp}" --json
  RESULT_VARIABLE rc
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)
if(NOT rc EQUAL 0)
  message(STATUS "stdout: ${out}")
  message(FATAL_ERROR "migrate failed (${rc}): ${err}")
endif()

if(NOT EXISTS "${actual_gxp}")
  message(FATAL_ERROR "Expected migrated file not found: ${actual_gxp}")
endif()

file(READ "${actual_gxp}" actual)
file(READ "${GOLDEN_GXP}" golden)

# Normalize newlines so comparisons are stable across platforms/editors.
string(REPLACE "\r\n" "\n" actual "${actual}")
string(REPLACE "\r" "\n" actual "${actual}")
string(REPLACE "\r\n" "\n" golden "${golden}")
string(REPLACE "\r" "\n" golden "${golden}")

# Normalize trailing whitespace at line ends.
string(REGEX REPLACE "[ \t]+\n" "\n" actual "${actual}")
string(REGEX REPLACE "[ \t]+\n" "\n" golden "${golden}")

set(actual_norm "${OUT_DIR}/actual.normalized.txt")
set(golden_norm "${OUT_DIR}/golden.normalized.txt")
file(WRITE "${actual_norm}" "${actual}")
file(WRITE "${golden_norm}" "${golden}")

execute_process(
  COMMAND "${CMAKE_COMMAND}" -E compare_files "${golden_norm}" "${actual_norm}"
  RESULT_VARIABLE diff_rc
)

if(NOT diff_rc EQUAL 0)
  message(FATAL_ERROR "Golden mismatch for ${GUIX_PROJECT}.\nGolden: ${GOLDEN_GXP}\nActual: ${actual_gxp}")
endif()
