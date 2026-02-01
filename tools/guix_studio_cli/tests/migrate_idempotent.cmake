# Ensure that migrating a project to the latest schema is idempotent.
#
# Inputs:
#  - GUIX_STUDIO_CLI: path to guix_studio_cli executable
#  - GUIX_PROJECT: path to a .gxp
#  - OUT_DIR: directory for generated outputs

if (NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "GUIX_STUDIO_CLI not set")
endif()
if (NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "GUIX_PROJECT not set")
endif()
if (NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "OUT_DIR not set")
endif()

file(MAKE_DIRECTORY "${OUT_DIR}")

get_filename_component(PROJ_BASE "${GUIX_PROJECT}" NAME_WE)
if (PROJ_BASE STREQUAL "")
  set(PROJ_BASE "project")
endif()

set(OUT1 "${OUT_DIR}/${PROJ_BASE}.migrated_1.gxp")
set(OUT2 "${OUT_DIR}/${PROJ_BASE}.migrated_2.gxp")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" migrate --project "${GUIX_PROJECT}" --output "${OUT1}" --json
  RESULT_VARIABLE rv1
  OUTPUT_VARIABLE out1
  ERROR_VARIABLE err1
)
if (NOT rv1 EQUAL 0)
  message(FATAL_ERROR "migrate pass1 failed (rv=${rv1})\nstdout: ${out1}\nstderr: ${err1}")
endif()

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" migrate --project "${OUT1}" --output "${OUT2}" --json
  RESULT_VARIABLE rv2
  OUTPUT_VARIABLE out2
  ERROR_VARIABLE err2
)
if (NOT rv2 EQUAL 0)
  message(FATAL_ERROR "migrate pass2 failed (rv=${rv2})\nstdout: ${out2}\nstderr: ${err2}")
endif()

if (NOT EXISTS "${OUT1}")
  message(FATAL_ERROR "Expected migrated file not found: ${OUT1}")
endif()
if (NOT EXISTS "${OUT2}")
  message(FATAL_ERROR "Expected migrated file not found: ${OUT2}")
endif()

file(READ "${OUT1}" c1)
file(READ "${OUT2}" c2)

# Normalize newlines and trailing whitespace so comparisons are stable across platforms.
string(REPLACE "\r\n" "\n" c1 "${c1}")
string(REPLACE "\r" "\n" c1 "${c1}")
string(REPLACE "\r\n" "\n" c2 "${c2}")
string(REPLACE "\r" "\n" c2 "${c2}")

string(REGEX REPLACE "[ \t]+\n" "\n" c1 "${c1}")
string(REGEX REPLACE "[ \t]+\n" "\n" c2 "${c2}")

set(NORM1 "${OUT_DIR}/${PROJ_BASE}.migrated_1.normalized.txt")
set(NORM2 "${OUT_DIR}/${PROJ_BASE}.migrated_2.normalized.txt")
file(WRITE "${NORM1}" "${c1}")
file(WRITE "${NORM2}" "${c2}")

execute_process(
  COMMAND "${CMAKE_COMMAND}" -E compare_files "${NORM1}" "${NORM2}"
  RESULT_VARIABLE diff_rc
)

if (NOT diff_rc EQUAL 0)
  message(FATAL_ERROR "Migration is not idempotent for ${GUIX_PROJECT}.\nFirst: ${OUT1}\nSecond: ${OUT2}")
endif()
