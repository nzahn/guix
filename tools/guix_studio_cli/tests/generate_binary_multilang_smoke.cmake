# Smoke test for `guix_studio_cli generate --binary` with multiple languages.
#
# Verifies we produce a valid binres string table for a multi-language project
# and that the first string entry exists in each language.

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
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --binary --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "generate --binary failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
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

# Check magic at start of file: GX_MAGIC_NUMBER (0x4758) stored little-endian => bytes 0x58 0x47.
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

function(read_u32_le out_var offset)
  file(READ "${bin}" tmp_hex HEX OFFSET ${offset} LIMIT 4)
  string(TOUPPER "${tmp_hex}" tmp_hex)
  string(SUBSTRING "${tmp_hex}" 0 2 b0)
  string(SUBSTRING "${tmp_hex}" 2 2 b1)
  string(SUBSTRING "${tmp_hex}" 4 2 b2)
  string(SUBSTRING "${tmp_hex}" 6 2 b3)
  set(val_hex "${b3}${b2}${b1}${b0}")
  math(EXPR val "0x${val_hex}")
  set(${out_var} ${val} PARENT_SCOPE)
endfunction()

# Parse GX_RESOURCE_HEADER.
set(RES_HDR_SIZE 20)
read_u16_le(theme_count 4)
read_u32_le(theme_data_size 8)

if(NOT theme_count EQUAL 2)
  message(FATAL_ERROR "Unexpected theme_count: ${theme_count}")
endif()

# Validate theme 0 contains a non-empty color table.
set(theme0_off ${RES_HDR_SIZE})
math(EXPR theme0_color_count_off "${theme0_off} + 4")
read_u16_le(theme0_color_count ${theme0_color_count_off})
if(theme0_color_count LESS 1)
  message(FATAL_ERROR "Expected theme0_color_count >= 1, got ${theme0_color_count}")
endif()

# GX_COLOR_HEADER starts immediately after GX_THEME_HEADER.
set(THEME_HDR_SIZE 114)
math(EXPR theme0_color_hdr_off "${theme0_off} + ${THEME_HDR_SIZE}")
read_u16_le(color_magic ${theme0_color_hdr_off})
math(EXPR theme0_color_hdr_off_2 "${theme0_color_hdr_off} + 2")
math(EXPR theme0_color_hdr_off_4 "${theme0_color_hdr_off} + 4")
read_u16_le(color_count_in_hdr ${theme0_color_hdr_off_2})
read_u32_le(color_data_size ${theme0_color_hdr_off_4})

if(NOT color_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_COLOR_HEADER magic: ${color_magic}")
endif()
if(NOT color_count_in_hdr EQUAL theme0_color_count)
  message(FATAL_ERROR "GX_COLOR_HEADER count mismatch. theme0=${theme0_color_count}, hdr=${color_count_in_hdr}")
endif()
math(EXPR expected_color_data_size "${theme0_color_count} * 4")
if(NOT color_data_size EQUAL expected_color_data_size)
  message(FATAL_ERROR "Unexpected GX_COLOR_HEADER data_size. Expected ${expected_color_data_size}, got ${color_data_size}")
endif()

# First color value for this fixture is CANVAS=4278190080 (0xFF000000).
math(EXPR first_color_off "${theme0_color_hdr_off} + 8")
read_u32_le(first_color ${first_color_off})
if(NOT first_color EQUAL 4278190080)
  message(FATAL_ERROR "Unexpected first color value. Expected 4278190080, got ${first_color}")
endif()

math(EXPR string_hdr_off "${RES_HDR_SIZE} + ${theme_data_size}")

read_u16_le(str_magic ${string_hdr_off})
math(EXPR string_hdr_off_2 "${string_hdr_off} + 2")
math(EXPR string_hdr_off_4 "${string_hdr_off} + 4")
read_u16_le(lang_count ${string_hdr_off_2})
read_u16_le(str_count ${string_hdr_off_4})

if(NOT str_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_STRING_HEADER magic: ${str_magic}")
endif()
if(NOT lang_count EQUAL 2)
  message(FATAL_ERROR "Unexpected language_count: ${lang_count}")
endif()
if(NOT str_count EQUAL 8)
  message(FATAL_ERROR "Unexpected string_count: ${str_count}")
endif()

# Language 0 header and first string.
math(EXPR lang0_hdr_off "${string_hdr_off} + 10")
math(EXPR lang0_data_off "${lang0_hdr_off} + 72")

read_u16_le(l0_len ${lang0_data_off})
if(NOT l0_len EQUAL 7)
  message(FATAL_ERROR "Unexpected lang0 first string length. Expected 7, got ${l0_len}")
endif()
math(EXPR l0_str_off "${lang0_data_off} + 2")
file(READ "${bin}" l0_hex HEX OFFSET ${l0_str_off} LIMIT 7)
string(TOUPPER "${l0_hex}" l0_hex)
if(NOT "${l0_hex}" STREQUAL "7468656D652031")
  message(FATAL_ERROR "Unexpected lang0 first string bytes: ${l0_hex}")
endif()

# Find language 0 data_size to locate language 1.
math(EXPR lang0_data_size_off "${lang0_hdr_off} + 68")
read_u32_le(lang0_data_size ${lang0_data_size_off})
math(EXPR lang1_hdr_off "${lang0_hdr_off} + 72 + ${lang0_data_size}")

# Language 1 header and first string.
read_u16_le(lang1_magic ${lang1_hdr_off})
if(NOT lang1_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_LANGUAGE_HEADER magic for lang1: ${lang1_magic}")
endif()
math(EXPR lang1_data_off "${lang1_hdr_off} + 72")
read_u16_le(l1_len ${lang1_data_off})
if(NOT l1_len EQUAL 7)
  message(FATAL_ERROR "Unexpected lang1 first string length. Expected 7, got ${l1_len}")
endif()
math(EXPR l1_str_off "${lang1_data_off} + 2")
file(READ "${bin}" l1_hex HEX OFFSET ${l1_str_off} LIMIT 7)
string(TOUPPER "${l1_hex}" l1_hex)
if(NOT "${l1_hex}" STREQUAL "74656D61732031")
  message(FATAL_ERROR "Unexpected lang1 first string bytes: ${l1_hex}")
endif()
