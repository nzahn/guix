# Compare guix_studio_cli export-resource-xml output to a committed golden file.
#
# Required variables:
#  - GUIX_STUDIO_CLI: path to the guix_studio_cli executable
#  - GUIX_PROJECT: path to a .gxp project
#  - OUT_DIR: output directory
#  - GOLDEN_XML: path to golden .resource.xml file

if(NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "Missing required -DGUIX_STUDIO_CLI")
endif()
if(NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "Missing required -DGUIX_PROJECT")
endif()
if(NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "Missing required -DOUT_DIR")
endif()
if(NOT DEFINED GOLDEN_XML)
  message(FATAL_ERROR "Missing required -DGOLDEN_XML")
endif()

file(MAKE_DIRECTORY "${OUT_DIR}")

# Use a dedicated temp folder to avoid polluting OUT_DIR and to keep globbing stable.
set(TMP_DIR "${OUT_DIR}/_golden_tmp")
file(REMOVE_RECURSE "${TMP_DIR}")
file(MAKE_DIRECTORY "${TMP_DIR}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" export-resource-xml --project "${GUIX_PROJECT}" --output_path "${TMP_DIR}" --json
  RESULT_VARIABLE rc
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)
if(NOT rc EQUAL 0)
  message(STATUS "stdout: ${out}")
  message(FATAL_ERROR "export-resource-xml failed (${rc}): ${err}")
endif()

file(GLOB xml_files "${TMP_DIR}/*.resource.xml")
list(LENGTH xml_files xml_len)
if(NOT xml_len EQUAL 1)
  message(FATAL_ERROR "Expected exactly 1 *.resource.xml in ${TMP_DIR}, found ${xml_len}: ${xml_files}")
endif()
list(GET xml_files 0 actual_xml)

file(READ "${actual_xml}" actual)
file(READ "${GOLDEN_XML}" golden)

# Normalize newlines so comparisons are stable across platforms/editors.
string(REPLACE "\r\n" "\n" actual "${actual}")
string(REPLACE "\r" "\n" actual "${actual}")
string(REPLACE "\r\n" "\n" golden "${golden}")
string(REPLACE "\r" "\n" golden "${golden}")

# Normalize trailing whitespace at line ends.
string(REGEX REPLACE "[ \t]+\n" "\n" actual "${actual}")
string(REGEX REPLACE "[ \t]+\n" "\n" golden "${golden}")

set(actual_norm "${TMP_DIR}/actual.normalized.txt")
set(golden_norm "${TMP_DIR}/golden.normalized.txt")
file(WRITE "${actual_norm}" "${actual}")
file(WRITE "${golden_norm}" "${golden}")

execute_process(
  COMMAND "${CMAKE_COMMAND}" -E compare_files "${golden_norm}" "${actual_norm}"
  RESULT_VARIABLE diff_rc
)

if(NOT diff_rc EQUAL 0)
  message(FATAL_ERROR "Golden mismatch for ${GUIX_PROJECT}.\nGolden: ${GOLDEN_XML}\nActual: ${actual_xml}")
endif()
