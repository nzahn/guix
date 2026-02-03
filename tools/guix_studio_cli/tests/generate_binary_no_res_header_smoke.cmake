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

# Use the CLI's binres inspector to locate section offsets.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" binres-inspect --input "${bin}" --json --no_res_header
  RESULT_VARIABLE rv_ins
  OUTPUT_VARIABLE out_ins
  ERROR_VARIABLE err_ins
)

if(NOT rv_ins EQUAL 0)
  message(FATAL_ERROR "binres-inspect failed (rv=${rv_ins})\nstdout:\n${out_ins}\nstderr:\n${err_ins}\n")
endif()

string(REGEX MATCH "\"theme_offsets\":\\[([0-9]+)\\]" m_theme_offsets "${out_ins}")
if(NOT m_theme_offsets)
  message(FATAL_ERROR "Unable to find theme_offsets in binres-inspect JSON:\n${out_ins}")
endif()
set(theme0_off ${CMAKE_MATCH_1})
if(NOT theme0_off EQUAL 0)
  message(FATAL_ERROR "Unexpected theme0 offset from binres-inspect. Expected 0 for --no_res_header, got ${theme0_off}")
endif()

string(REGEX MATCH "\"pixelmap_section_offsets\":\\[([0-9]+)\\]" m_px_offsets "${out_ins}")
if(NOT m_px_offsets)
  message(FATAL_ERROR "Unable to find pixelmap_section_offsets in binres-inspect JSON:\n${out_ins}")
endif()
set(pixelmap0_off ${CMAKE_MATCH_1})

string(REGEX MATCH "\"string_header_offset\":([0-9]+)" m_str_off "${out_ins}")
if(NOT m_str_off)
  message(FATAL_ERROR "Unable to find string_header_offset in binres-inspect JSON:\n${out_ins}")
endif()
set(STRING_HDR_OFF ${CMAKE_MATCH_1})

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

function(read_u8 out_var offset)
  file(READ "${bin}" tmp_hex HEX OFFSET ${offset} LIMIT 1)
  string(TOUPPER "${tmp_hex}" tmp_hex)
  math(EXPR val "0x${tmp_hex}")
  set(${out_var} ${val} PARENT_SCOPE)
endfunction()

function(read_u32_be_file path out_var offset)
  file(READ "${path}" tmp_hex HEX OFFSET ${offset} LIMIT 4)
  string(TOUPPER "${tmp_hex}" tmp_hex)
  string(SUBSTRING "${tmp_hex}" 0 2 b0)
  string(SUBSTRING "${tmp_hex}" 2 2 b1)
  string(SUBSTRING "${tmp_hex}" 4 2 b2)
  string(SUBSTRING "${tmp_hex}" 6 2 b3)
  set(val_hex "${b0}${b1}${b2}${b3}")
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

# Validate we populate scrollbar appearance/styles from the fixture .gxp.
# Offsets per `common/src/gx_binres_theme_load.c` read order.
read_u16_le(vscroll_width 12)
if(NOT vscroll_width EQUAL 20)
  message(FATAL_ERROR "Unexpected vscroll width. Expected 20, got ${vscroll_width}")
endif()

read_u16_le(hscroll_width 49)
if(NOT hscroll_width EQUAL 20)
  message(FATAL_ERROR "Unexpected hscroll width. Expected 20, got ${hscroll_width}")
endif()

# vscroll_style and hscroll_style are ULONGs at offsets 86 and 90.
read_u32_le(vscroll_style 86)
if(NOT vscroll_style EQUAL 17170432)
  message(FATAL_ERROR "Unexpected vscroll style. Expected 17170432, got ${vscroll_style}")
endif()

read_u32_le(hscroll_style 90)
if(NOT hscroll_style EQUAL 33947648)
  message(FATAL_ERROR "Unexpected hscroll style. Expected 33947648, got ${hscroll_style}")
endif()

# Validate scrollbar color IDs are in-range and match expected IDs for this fixture.
math(EXPR vscroll_thumb_color_off "0 + 37")
read_u32_le(vscroll_thumb_color ${vscroll_thumb_color_off})
if(vscroll_thumb_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "vscroll_thumb_color out of range. color_count=${theme0_color_count}, id=${vscroll_thumb_color}")
endif()
if(NOT vscroll_thumb_color EQUAL 0)
  message(FATAL_ERROR "Unexpected vscroll thumb color ID. Expected 0 (CANVAS), got ${vscroll_thumb_color}")
endif()

math(EXPR vscroll_button_color_off "0 + 45")
read_u32_le(vscroll_button_color ${vscroll_button_color_off})
if(vscroll_button_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "vscroll_button_color out of range. color_count=${theme0_color_count}, id=${vscroll_button_color}")
endif()
if(NOT vscroll_button_color EQUAL 15)
  message(FATAL_ERROR "Unexpected vscroll button color ID. Expected 15 (SCROLL_BUTTON), got ${vscroll_button_color}")
endif()

math(EXPR hscroll_thumb_color_off "0 + 74")
read_u32_le(hscroll_thumb_color ${hscroll_thumb_color_off})
if(hscroll_thumb_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "hscroll_thumb_color out of range. color_count=${theme0_color_count}, id=${hscroll_thumb_color}")
endif()
if(NOT hscroll_thumb_color EQUAL 0)
  message(FATAL_ERROR "Unexpected hscroll thumb color ID. Expected 0 (CANVAS), got ${hscroll_thumb_color}")
endif()

math(EXPR hscroll_button_color_off "0 + 82")
read_u32_le(hscroll_button_color ${hscroll_button_color_off})
if(hscroll_button_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "hscroll_button_color out of range. color_count=${theme0_color_count}, id=${hscroll_button_color}")
endif()
if(NOT hscroll_button_color EQUAL 15)
  message(FATAL_ERROR "Unexpected hscroll button color ID. Expected 15 (SCROLL_BUTTON), got ${hscroll_button_color}")
endif()

# Validate theme header indicates a non-empty color table and that GX_COLOR_HEADER is present.
read_u16_le(theme0_color_count 4)
if(theme0_color_count LESS 1)
  message(FATAL_ERROR "Expected theme0_color_count >= 1, got ${theme0_color_count}")
endif()

# Validate font section is present and structurally sane.
read_u16_le(theme0_font_count 8)
if(theme0_font_count LESS 1)
  message(FATAL_ERROR "Expected theme0_font_count >= 1, got ${theme0_font_count}")
endif()

math(EXPR theme0_font_data_size_off "102")
read_u32_le(theme0_font_data_size ${theme0_font_data_size_off})
math(EXPR expected_font_data_size "${theme0_font_count} * 16")
if(NOT theme0_font_data_size EQUAL expected_font_data_size)
  message(FATAL_ERROR "Unexpected theme0_font_data_size. Expected ${expected_font_data_size}, got ${theme0_font_data_size}")
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

# First GX_FONT_HEADER should appear after GX_THEME_HEADER + color section.
math(EXPR theme0_color_data_size_off "94")
read_u32_le(theme0_color_section_size ${theme0_color_data_size_off})
math(EXPR font0_off "${THEME_HDR_SIZE} + ${theme0_color_section_size}")
read_u16_le(font0_magic ${font0_off})
if(NOT font0_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_FONT_HEADER magic: ${font0_magic}")
endif()
math(EXPR font0_default_off "${font0_off} + 6")
read_u8(font0_default ${font0_default_off})
if(NOT font0_default EQUAL 1)
  message(FATAL_ERROR "Expected default font flag == 1, got ${font0_default}")
endif()
math(EXPR font0_bits_off "${font0_off} + 7")
read_u8(font0_bits ${font0_bits_off})
if(NOT (font0_bits EQUAL 1 OR font0_bits EQUAL 4 OR font0_bits EQUAL 8))
  message(FATAL_ERROR "Unexpected font bits (expected 1,4,8): ${font0_bits}")
endif()
math(EXPR font0_data_size_off "${font0_off} + 8")
read_u32_le(font0_data_size ${font0_data_size_off})
if(NOT font0_data_size EQUAL 0)
  message(FATAL_ERROR "Expected default font data_size == 0, got ${font0_data_size}")
endif()

# Validate pixelmap section is present and structurally sane.
read_u16_le(theme0_pixelmap_count 10)
if(theme0_pixelmap_count LESS 1)
  message(FATAL_ERROR "Expected theme0_pixelmap_count >= 1, got ${theme0_pixelmap_count}")
endif()

math(EXPR theme0_pixelmap_data_size_off "106")
read_u32_le(theme0_pixelmap_data_size ${theme0_pixelmap_data_size_off})
math(EXPR expected_pixelmap_data_size "${theme0_pixelmap_count} * 32")
if(theme0_pixelmap_data_size LESS expected_pixelmap_data_size)
  message(FATAL_ERROR "Unexpected theme0_pixelmap_data_size. Expected >= ${expected_pixelmap_data_size}, got ${theme0_pixelmap_data_size}")
endif()

read_u16_le(pixelmap0_magic ${pixelmap0_off})
if(NOT pixelmap0_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_PIXELMAP_HEADER magic: ${pixelmap0_magic}")
endif()
math(EXPR pixelmap0_index_off "${pixelmap0_off} + 2")
read_u16_le(pixelmap0_index ${pixelmap0_index_off})
if(NOT pixelmap0_index EQUAL 1)
  message(FATAL_ERROR "Unexpected first pixelmap index. Expected 1, got ${pixelmap0_index}")
endif()

# Phase-3: verify we emit a real uncompressed 32ARGB payload for the first
# pixelmap in this fixture (RADIO_ON: graphics/radiobutton_on.png).
get_filename_component(PROJECT_DIR "${GUIX_PROJECT}" DIRECTORY)
set(png "${PROJECT_DIR}/graphics/radiobutton_on.png")
if(EXISTS "${png}")
  read_u32_be_file("${png}" png_w 16)
  read_u32_be_file("${png}" png_h 20)
  if(png_w LESS 1 OR png_h LESS 1)
    message(FATAL_ERROR "Unexpected PNG dimensions for ${png}: ${png_w}x${png_h}")
  endif()

  math(EXPR pixelmap0_map_size_off "${pixelmap0_off} + 8")
  read_u32_le(pixelmap0_map_size ${pixelmap0_map_size_off})
  math(EXPR expected_map_size "${png_w} * ${png_h} * 4")
  if(NOT pixelmap0_map_size EQUAL expected_map_size)
    message(FATAL_ERROR "Unexpected pixelmap0 map_size. Expected ${expected_map_size}, got ${pixelmap0_map_size}")
  endif()

  math(EXPR pixelmap0_data_size_off "${pixelmap0_off} + 24")
  read_u32_le(pixelmap0_data_size ${pixelmap0_data_size_off})
  if(NOT pixelmap0_data_size EQUAL expected_map_size)
    message(FATAL_ERROR "Unexpected pixelmap0 data_size. Expected ${expected_map_size}, got ${pixelmap0_data_size}")
  endif()

  math(EXPR pixelmap0_width_off "${pixelmap0_off} + 20")
  read_u16_le(pixelmap0_width ${pixelmap0_width_off})
  math(EXPR pixelmap0_height_off "${pixelmap0_off} + 22")
  read_u16_le(pixelmap0_height ${pixelmap0_height_off})
  if(NOT pixelmap0_width EQUAL png_w)
    message(FATAL_ERROR "Unexpected pixelmap0 width. Expected ${png_w}, got ${pixelmap0_width}")
  endif()
  if(NOT pixelmap0_height EQUAL png_h)
    message(FATAL_ERROR "Unexpected pixelmap0 height. Expected ${png_h}, got ${pixelmap0_height}")
  endif()
endif()

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
