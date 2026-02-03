# Smoke test for `guix_studio_cli generate --binary`.
#
# Verifies we produce a structurally valid binres header (GX magic) rather than a textual placeholder.

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

file(SIZE "${bin}" bin_size)
if(bin_size LESS 200)
  message(FATAL_ERROR "Binary output is unexpectedly small (${bin_size} bytes): ${bin}")
endif()

# Validate string table structure for this fixture.
# Layout (with resource header):
#   GX_RESOURCE_HEADER (20)
#   theme data (theme_data_size)
#   GX_STRING_HEADER (10)
#   GX_LANGUAGE_HEADER (72)
#   string entries...

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

set(RES_HDR_SIZE 20)

# Validate scrollbar appearance/styles are populated from the fixture .gxp.
# Theme header starts immediately after GX_RESOURCE_HEADER.
set(theme0_off ${RES_HDR_SIZE})
math(EXPR vscroll_width_off "${theme0_off} + 12")
read_u16_le(vscroll_width ${vscroll_width_off})
if(NOT vscroll_width EQUAL 20)
  message(FATAL_ERROR "Unexpected vscroll width. Expected 20, got ${vscroll_width}")
endif()

math(EXPR hscroll_width_off "${theme0_off} + 49")
read_u16_le(hscroll_width ${hscroll_width_off})
if(NOT hscroll_width EQUAL 20)
  message(FATAL_ERROR "Unexpected hscroll width. Expected 20, got ${hscroll_width}")
endif()

math(EXPR vscroll_style_off "${theme0_off} + 86")
read_u32_le(vscroll_style ${vscroll_style_off})
if(NOT vscroll_style EQUAL 17170432)
  message(FATAL_ERROR "Unexpected vscroll style. Expected 17170432, got ${vscroll_style}")
endif()

math(EXPR hscroll_style_off "${theme0_off} + 90")
read_u32_le(hscroll_style ${hscroll_style_off})
if(NOT hscroll_style EQUAL 33947648)
  message(FATAL_ERROR "Unexpected hscroll style. Expected 33947648, got ${hscroll_style}")
endif()

read_u32_le(theme_data_size 8)
math(EXPR string_hdr_off "${RES_HDR_SIZE} + ${theme_data_size}")

read_u16_le(str_magic "${string_hdr_off}")
math(EXPR string_hdr_off_2 "${string_hdr_off} + 2")
math(EXPR string_hdr_off_4 "${string_hdr_off} + 4")
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

math(EXPR lang_hdr_off "${string_hdr_off} + 10")
math(EXPR str_data_off "${lang_hdr_off} + 72")
read_u16_le(first_len "${str_data_off}")
if(NOT first_len EQUAL 12)
  message(FATAL_ERROR "Unexpected first string length. Expected 12, got ${first_len}")
endif()

# Verify the bytes for "Hello World!" and the trailing NUL.
math(EXPR hello_off "${str_data_off} + 2")
file(READ "${bin}" hello_hex HEX OFFSET ${hello_off} LIMIT 12)
string(TOUPPER "${hello_hex}" hello_hex)
if(NOT "${hello_hex}" STREQUAL "48656C6C6F20576F726C6421")
  message(FATAL_ERROR "Unexpected first string bytes: ${hello_hex}")
endif()
math(EXPR nul_off "${hello_off} + 12")
file(READ "${bin}" nul_hex HEX OFFSET ${nul_off} LIMIT 1)
string(TOUPPER "${nul_hex}" nul_hex)
if(NOT "${nul_hex}" STREQUAL "00")
  message(FATAL_ERROR "Expected NUL terminator after string, got ${nul_hex}")
endif()
