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

# Without GX_RESOURCE_HEADER, our writer layout is:
#   GX_THEME_HEADER (114)
#   theme data (gx_theme_header_data_size)
#   GX_STRING_HEADER (10)
#   GX_LANGUAGE_HEADER (72)
#   string entries...
set(THEME_HDR_SIZE 114)

# Validate theme header indicates a non-empty color table and that GX_COLOR_HEADER is present.
read_u16_le(theme0_color_count 4)
if(theme0_color_count LESS 1)
  message(FATAL_ERROR "Expected theme0_color_count >= 1, got ${theme0_color_count}")
endif()

# Theme data_size is the last ULONG in the GX_THEME_HEADER.
math(EXPR theme0_data_size_off "${THEME_HDR_SIZE} - 4")
read_u32_le(theme0_data_size ${theme0_data_size_off})

math(EXPR color_hdr_off "${THEME_HDR_SIZE}")
read_u16_le(color_magic ${color_hdr_off})
math(EXPR color_hdr_off_2 "${color_hdr_off} + 2")
math(EXPR color_hdr_off_4 "${color_hdr_off} + 4")
read_u16_le(color_count_in_hdr ${color_hdr_off_2})
read_u32_le(color_data_size ${color_hdr_off_4})

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
math(EXPR first_color_off "${color_hdr_off} + 8")
read_u32_le(first_color ${first_color_off})
if(NOT first_color EQUAL 4278190080)
  message(FATAL_ERROR "Unexpected first color value. Expected 4278190080, got ${first_color}")
endif()

math(EXPR STRING_HDR_OFF "${THEME_HDR_SIZE} + ${theme0_data_size}")

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
