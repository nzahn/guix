# Round-trip smoke test for `.gxp` parsing + writing.
#
# Uses `guix_studio_cli format-gxp` (no migration) to write a canonicalized copy,
# then asserts `summary --json` and `validate --json` match for key fields.

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

set(out_gxp "${OUT_DIR}/roundtrip.gxp")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" format-gxp --project "${GUIX_PROJECT}" --output "${out_gxp}" --json
  RESULT_VARIABLE rv_fmt
  OUTPUT_VARIABLE out_fmt
  ERROR_VARIABLE err_fmt
)
if(NOT rv_fmt EQUAL 0)
  message(FATAL_ERROR "format-gxp failed (rv=${rv_fmt})\nstdout:\n${out_fmt}\nstderr:\n${err_fmt}\n")
endif()

if(NOT EXISTS "${out_gxp}")
  message(FATAL_ERROR "Expected formatted output not created: ${out_gxp}")
endif()

# Compare summary JSON fields we expect to remain stable.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" summary --project "${GUIX_PROJECT}" --json
  RESULT_VARIABLE rv_sum1
  OUTPUT_VARIABLE sum1
  ERROR_VARIABLE err_sum1
)
if(NOT rv_sum1 EQUAL 0)
  message(FATAL_ERROR "summary(original) failed (rv=${rv_sum1})\nstdout:\n${sum1}\nstderr:\n${err_sum1}\n")
endif()

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" summary --project "${out_gxp}" --json
  RESULT_VARIABLE rv_sum2
  OUTPUT_VARIABLE sum2
  ERROR_VARIABLE err_sum2
)
if(NOT rv_sum2 EQUAL 0)
  message(FATAL_ERROR "summary(roundtrip) failed (rv=${rv_sum2})\nstdout:\n${sum2}\nstderr:\n${err_sum2}\n")
endif()

function(extract_json_string_field json key outVar)
  set(re "\"${key}\"\\s*:\\s*(null|\"([^\"]*)\")")
  string(REGEX MATCH "${re}" m "${json}")
  if(NOT m)
    set(${outVar} "__MISSING__" PARENT_SCOPE)
    return()
  endif()
  # If group 2 (the inner quoted value) matched, use it, else treat as empty.
  if(CMAKE_MATCH_2)
    set(${outVar} "${CMAKE_MATCH_2}" PARENT_SCOPE)
  else()
    set(${outVar} "" PARENT_SCOPE)
  endif()
endfunction()

extract_json_string_field("${sum1}" project_name name1)
extract_json_string_field("${sum2}" project_name name2)
if(NOT "${name1}" STREQUAL "${name2}")
  message(FATAL_ERROR "project_name changed after round-trip.\noriginal=${name1}\nroundtrip=${name2}\n")
endif()

extract_json_string_field("${sum1}" project_version pv1)
extract_json_string_field("${sum2}" project_version pv2)
if(NOT "${pv1}" STREQUAL "${pv2}")
  message(FATAL_ERROR "project_version changed after round-trip.\noriginal=${pv1}\nroundtrip=${pv2}\n")
endif()

extract_json_string_field("${sum1}" guix_version gv1)
extract_json_string_field("${sum2}" guix_version gv2)
if(NOT "${gv1}" STREQUAL "${gv2}")
  message(FATAL_ERROR "guix_version changed after round-trip.\noriginal=${gv1}\nroundtrip=${gv2}\n")
endif()

extract_json_string_field("${sum1}" studio_version sv1)
extract_json_string_field("${sum2}" studio_version sv2)
if(NOT "${sv1}" STREQUAL "${sv2}")
  message(FATAL_ERROR "studio_version changed after round-trip.\noriginal=${sv1}\nroundtrip=${sv2}\n")
endif()

# Validate both; both should parse and be OK.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" validate --project "${GUIX_PROJECT}" --json
  RESULT_VARIABLE rv_val1
  OUTPUT_VARIABLE val1
  ERROR_VARIABLE err_val1
)
if(NOT rv_val1 EQUAL 0)
  message(FATAL_ERROR "validate(original) failed (rv=${rv_val1})\nstdout:\n${val1}\nstderr:\n${err_val1}\n")
endif()

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" validate --project "${out_gxp}" --json
  RESULT_VARIABLE rv_val2
  OUTPUT_VARIABLE val2
  ERROR_VARIABLE err_val2
)
if(NOT rv_val2 EQUAL 0)
  message(FATAL_ERROR "validate(roundtrip) failed (rv=${rv_val2})\nstdout:\n${val2}\nstderr:\n${err_val2}\n")
endif()

string(FIND "${val1}" "\"ok\":true" ok1)
string(FIND "${val2}" "\"ok\":true" ok2)
if(ok1 EQUAL -1)
  message(FATAL_ERROR "validate(original) did not report ok:true\n${val1}")
endif()
if(ok2 EQUAL -1)
  message(FATAL_ERROR "validate(roundtrip) did not report ok:true\n${val2}")
endif()
