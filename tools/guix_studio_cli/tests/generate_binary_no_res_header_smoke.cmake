# Smoke test for `guix_studio_cli generate --binary --no_res_header`.
#
# Verifies we produce a structurally valid binres image with the GX_RESOURCE_HEADER omitted,
# and that the string table is still parseable.

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
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --binary --no_res_header --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "generate --binary --no_res_header failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

# Extract the binary output path from JSON.
string(REGEX MATCH "\"kind\"\s*:\s*\"binary\"\s*,\s*\"path\"\s*:\s*\"([^\"]+)\"" m "${out}")
if(NOT m)
  message(FATAL_ERROR "Unable to find binary output path in JSON:\n${out}")
endif()
set(bin "${CMAKE_MATCH_1}")

if(NOT EXISTS "${bin}")
  message(FATAL_ERROR "Expected binary output not created: ${bin}")
endif()

# Start of file should still begin with GX_MAGIC_NUMBER (0x4758) stored little-endian => 0x58 0x47.
file(READ "${bin}" hdr_hex HEX OFFSET 0 LIMIT 2)
string(TOUPPER "${hdr_hex}" hdr_hex)
if(NOT "${hdr_hex}" STREQUAL "5847")
  message(FATAL_ERROR "Unexpected binres magic. Expected 5847, got ${hdr_hex} (file=${bin})")
endif()

function(read_u16_le out_var offset)
  file(READ "${bin}" tmp_hex HEX OFFSET ${offset} LIMIT 2)
  string(TOUPPER "${tmp_hex}" tmp_hex)
  string(SUBSTRING "${tmp_hex}" 0 2 b0)
  string(SUBSTRING "${tmp_hex}" 2 2 b1)
  set(val_hex "${b1}${b0}")
  math(EXPR val "0x${val_hex}")
  set(${out_var} ${val} PARENT_SCOPE)
endfunction()

# Without GX_RESOURCE_HEADER, our current writer layout is:
#   GX_THEME_HEADER (114)
#   GX_STRING_HEADER (10)
#   GX_LANGUAGE_HEADER (72)
#   string entries...
set(THEME_HDR_SIZE 114)
set(STRING_HDR_OFF ${THEME_HDR_SIZE})

read_u16_le(str_magic ${STRING_HDR_OFF})
math(EXPR string_hdr_off_2 "${STRING_HDR_OFF} + 2")
math(EXPR string_hdr_off_4 "${STRING_HDR_OFF} + 4")
read_u16_le(lang_count ${string_hdr_off_2})
read_u16_le(str_count ${string_hdr_off_4})

if(NOT str_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_STRING_HEADER magic: ${str_magic}")
endif()
if(NOT lang_count EQUAL 1)
  message(FATAL_ERROR "Unexpected language_count: ${lang_count}")
endif()
if(NOT str_count EQUAL 2)
  message(FATAL_ERROR "Unexpected string_count: ${str_count}")
endif()

math(EXPR lang_hdr_off "${STRING_HDR_OFF} + 10")
math(EXPR str_data_off "${lang_hdr_off} + 72")
read_u16_le(first_len ${str_data_off})
if(NOT first_len EQUAL 12)
  message(FATAL_ERROR "Unexpected first string length. Expected 12, got ${first_len}")
endif()

math(EXPR hello_off "${str_data_off} + 2")
file(READ "${bin}" hello_hex HEX OFFSET ${hello_off} LIMIT 12)
string(TOUPPER "${hello_hex}" hello_hex)
if(NOT "${hello_hex}" STREQUAL "48656C6C6F20576F726C6421")
  message(FATAL_ERROR "Unexpected first string bytes: ${hello_hex}")
endif()
