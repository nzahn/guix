# Smoke test for `guix_studio_cli export-strings` (legacy Studio CSV format).

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

set(csv_path "${OUT_DIR}/guix_simple.csv")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" export-strings --project "${GUIX_PROJECT}" --output "${csv_path}" --src English --target French --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "export-strings failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

if(NOT EXISTS "${csv_path}")
  message(FATAL_ERROR "Expected output CSV not created: ${csv_path}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

file(READ "${csv_path}" csv_contents)

# Header should be legacy Studio format and include language IDs.
string(FIND "${csv_contents}" "name,en,fr" header_pos)
if(header_pos EQUAL -1)
  message(FATAL_ERROR "CSV header not in expected legacy format (name,en,fr).\nCSV:\n${csv_contents}\n")
endif()

# Should include at least one known string id from the fixture.
string(FIND "${csv_contents}" "STRING_1" id_pos)
if(id_pos EQUAL -1)
  message(FATAL_ERROR "CSV missing expected STRING_1 record.\nCSV:\n${csv_contents}\n")
endif()
