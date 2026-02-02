# Smoke test for `guix_studio_cli export-xliff`.

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

set(xlf_path "${OUT_DIR}/guix_simple.xlf")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" export-xliff --project "${GUIX_PROJECT}" --output "${xlf_path}" --src English --target French --version 2 --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "export-xliff failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

if(NOT EXISTS "${xlf_path}")
  message(FATAL_ERROR "Expected output XLIFF not created: ${xlf_path}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

file(READ "${xlf_path}" xlf_contents)
string(FIND "${xlf_contents}" "srcLang=\"en\"" src_pos)
if(src_pos EQUAL -1)
  message(FATAL_ERROR "XLIFF missing srcLang=\"en\"")
endif()
string(FIND "${xlf_contents}" "trgLang=\"fr\"" trg_pos)
if(trg_pos EQUAL -1)
  message(FATAL_ERROR "XLIFF missing trgLang=\"fr\"")
endif()
string(FIND "${xlf_contents}" "name=\"STRING_1\"" id_pos)
if(id_pos EQUAL -1)
  message(FATAL_ERROR "XLIFF missing STRING_1 unit")
endif()
