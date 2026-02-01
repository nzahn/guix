# Smoke test for explicit .gxp migration.
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
set(OUT_FILE "${OUT_DIR}/${PROJ_BASE}.migrated.gxp")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" migrate --project "${GUIX_PROJECT}" --output "${OUT_FILE}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if (NOT rv EQUAL 0)
  message(FATAL_ERROR "migrate failed (rv=${rv})\nstdout: ${out}\nstderr: ${err}")
endif()

if (NOT EXISTS "${OUT_FILE}")
  message(FATAL_ERROR "Expected migrated file not found: ${OUT_FILE}")
endif()

file(READ "${OUT_FILE}" contents)

string(FIND "${contents}" "<!DOCTYPE GUIX_Studio_Project" doctype_pos)
if (doctype_pos EQUAL -1)
  message(FATAL_ERROR "Expected GUIX_Studio_Project doctype in migrated output")
endif()

string(FIND "${contents}" "<project_version>56</project_version>" ver_pos)
if (ver_pos EQUAL -1)
  message(FATAL_ERROR "Expected <project_version>56</project_version> in migrated output")
endif()

# Expectations can be customized by the test that invokes this script.
# - EXPECT_PRESENT: semicolon-separated list of substrings that must appear
# - EXPECT_ABSENT: semicolon-separated list of substrings that must NOT appear

if (NOT DEFINED EXPECT_PRESENT)
  # Defaults validate the common v55->v56 normalization behavior.
  set(EXPECT_PRESENT
    "<folder_id>DEFAULT_COLOR_FOLDER</folder_id>"
    "<color_format></color_format>"
  )
endif()

if (NOT DEFINED EXPECT_ABSENT)
  set(EXPECT_ABSENT
    "<folder_id>4096</folder_id>"
    "<color_format>0</color_format>"
  )
endif()

foreach (needle IN LISTS EXPECT_PRESENT)
  if (needle STREQUAL "")
    continue()
  endif()
  string(FIND "${contents}" "${needle}" pos)
  if (pos EQUAL -1)
    message(FATAL_ERROR "Expected to find '${needle}' in migrated output")
  endif()
endforeach()

foreach (needle IN LISTS EXPECT_ABSENT)
  if (needle STREQUAL "")
    continue()
  endif()
  string(FIND "${contents}" "${needle}" pos)
  if (NOT pos EQUAL -1)
    message(FATAL_ERROR "Expected to NOT find '${needle}' in migrated output")
  endif()
endforeach()
