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

set(out_orig "${OUT_DIR}/orig")
file(MAKE_DIRECTORY "${out_orig}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${GUIX_PROJECT}" --output_path "${out_orig}" --binary --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "generate --binary failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

# Extract the binary output path from JSON.
string(REGEX MATCH "\"kind\"\\s*:\\s*\"binary\"\\s*,\\s*\"path\"\\s*:\\s*\"([^\"]+)\"" m "${out}")
if(NOT m)
  message(FATAL_ERROR "Unable to find binary output path in JSON:\n${out}")
endif()
set(bin "${CMAKE_MATCH_1}")

set(bin_orig "${bin}")

if(NOT EXISTS "${bin}")
  message(FATAL_ERROR "Expected binary output not created: ${bin}")
endif()

# Use the CLI's binres inspector to locate theme/pixelmap section offsets.
# This reduces duplicated layout math in the smoke test while still validating
# the actual bytes in the generated binres at those offsets.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" binres-inspect --input "${bin}" --json
  RESULT_VARIABLE rv_ins
  OUTPUT_VARIABLE out_ins
  ERROR_VARIABLE err_ins
)

if(NOT rv_ins EQUAL 0)
  message(FATAL_ERROR "binres-inspect failed (rv=${rv_ins})\nstdout:\n${out_ins}\nstderr:\n${err_ins}\n")
endif()

string(REGEX MATCH "\"theme_offsets\":\\[([0-9]+),([0-9]+)\\]" m_theme_offsets "${out_ins}")
if(NOT m_theme_offsets)
  message(FATAL_ERROR "Unable to find theme_offsets in binres-inspect JSON:\n${out_ins}")
endif()
set(theme0_off ${CMAKE_MATCH_1})
set(theme1_off ${CMAKE_MATCH_2})

string(REGEX MATCH "\"pixelmap_section_offsets\":\\[([0-9]+),([0-9]+)\\]" m_px_offsets "${out_ins}")
if(NOT m_px_offsets)
  message(FATAL_ERROR "Unable to find pixelmap_section_offsets in binres-inspect JSON:\n${out_ins}")
endif()
set(pixelmap0_off ${CMAKE_MATCH_1})
set(pixelmap1_0_off ${CMAKE_MATCH_2})

string(REGEX MATCH "\"string_header_offset\":([0-9]+)" m_str_off "${out_ins}")
if(NOT m_str_off)
  message(FATAL_ERROR "Unable to find string_header_offset in binres-inspect JSON:\n${out_ins}")
endif()
set(string_hdr_off_ins ${CMAKE_MATCH_1})

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

function(read_u8 out_var offset)
  file(READ "${bin}" tmp_hex HEX OFFSET ${offset} LIMIT 1)
  string(TOUPPER "${tmp_hex}" tmp_hex)
  math(EXPR val "0x${tmp_hex}")
  set(${out_var} ${val} PARENT_SCOPE)
endfunction()

function(expect_ascii_bytes_at_offset offset expected_hex expected_label)
  string(LENGTH "${expected_hex}" expected_hex_len)
  math(EXPR expected_len "${expected_hex_len} / 2")
  file(READ "${bin}" got_hex HEX OFFSET ${offset} LIMIT ${expected_len})
  string(TOUPPER "${got_hex}" got_hex)
  if(NOT "${got_hex}" STREQUAL "${expected_hex}")
    message(FATAL_ERROR "Unexpected ${expected_label} bytes. Expected ${expected_hex}, got ${got_hex}")
  endif()
endfunction()

# Assert that the string at a particular string index matches expected bytes.
#
# Binres encoding (modern): for each string index 1..string_count-1:
#   USHORT length; then `length` bytes; then NUL.
function(assert_string_at_index lang_data_off string_count target_index expected_len expected_hex expected_label)
  if(string_count LESS_EQUAL target_index)
    message(FATAL_ERROR "string_count too small to contain ${expected_label}. string_count=${string_count}, want index=${target_index}")
  endif()

  set(cur ${lang_data_off})
  # Skip entries 1..target_index-1.
  math(EXPR last_skip "${target_index} - 1")
  if(last_skip GREATER_EQUAL 1)
    foreach(si RANGE 1 ${last_skip})
      read_u16_le(slen ${cur})
      math(EXPR cur "${cur} + 2")
      if(NOT slen EQUAL 0)
        math(EXPR cur "${cur} + ${slen} + 1")
      endif()
    endforeach()
  endif()

  # Now at target_index length field.
  read_u16_le(got_len ${cur})
  if(NOT got_len EQUAL expected_len)
    message(FATAL_ERROR "Unexpected ${expected_label} length. Expected ${expected_len}, got ${got_len}")
  endif()
  math(EXPR data_off "${cur} + 2")
  file(READ "${bin}" got_hex HEX OFFSET ${data_off} LIMIT ${expected_len})
  string(TOUPPER "${got_hex}" got_hex)
  if(NOT "${got_hex}" STREQUAL "${expected_hex}")
    message(FATAL_ERROR "Unexpected ${expected_label} bytes. Expected ${expected_hex}, got ${got_hex}")
  endif()
  math(EXPR nul_off "${data_off} + ${expected_len}")
  file(READ "${bin}" nul_hex HEX OFFSET ${nul_off} LIMIT 1)
  string(TOUPPER "${nul_hex}" nul_hex)
  if(NOT "${nul_hex}" STREQUAL "00")
    message(FATAL_ERROR "Missing NUL terminator for ${expected_label}. Got ${nul_hex}")
  endif()
endfunction()

# Assert that an empty string is encoded as:
#   USHORT length=0; then immediately the next entry (no bytes, no NUL).
function(assert_empty_string_at_index lang_data_off string_count target_index expected_next_len expected_label)
  if(string_count LESS_EQUAL target_index)
    message(FATAL_ERROR "string_count too small to contain ${expected_label}. string_count=${string_count}, want index=${target_index}")
  endif()
  if(target_index GREATER_EQUAL string_count)
    message(FATAL_ERROR "Invalid target_index for ${expected_label}: ${target_index}")
  endif()
  math(EXPR last_index "${string_count} - 1")
  if(target_index EQUAL last_index)
    message(FATAL_ERROR "Cannot assert empty string at last index for ${expected_label} (no next entry to validate)")
  endif()

  set(cur ${lang_data_off})
  math(EXPR last_skip "${target_index} - 1")
  if(last_skip GREATER_EQUAL 1)
    foreach(si RANGE 1 ${last_skip})
      read_u16_le(slen ${cur})
      math(EXPR cur "${cur} + 2")
      if(NOT slen EQUAL 0)
        math(EXPR cur "${cur} + ${slen} + 1")
      endif()
    endforeach()
  endif()

  read_u16_le(got_len ${cur})
  if(NOT got_len EQUAL 0)
    message(FATAL_ERROR "Unexpected ${expected_label} length. Expected 0, got ${got_len}")
  endif()

  math(EXPR next_len_off "${cur} + 2")
  read_u16_le(next_len ${next_len_off})
  if(NOT next_len EQUAL expected_next_len)
    message(FATAL_ERROR "Unexpected ${expected_label} next-length field. Expected ${expected_next_len}, got ${next_len} (this usually means an unexpected NUL/padding byte was inserted)")
  endif()
endfunction()

function(find_string_record_index out_var gxp_path target_id)
  set(found_index -1)
  set(in_string_table 0)
  set(in_string_record 0)
  set(record_index 0)

  file(STRINGS "${gxp_path}" gxp_lines)
  foreach(raw_line IN LISTS gxp_lines)
    set(line "${raw_line}")
    string(STRIP "${line}" line)

    if(NOT in_string_table)
      if(line STREQUAL "<string_table>")
        set(in_string_table 1)
      endif()
      continue()
    endif()

    if(line STREQUAL "</string_table>")
      break()
    endif()

    if(line STREQUAL "<string_record>")
      set(in_string_record 1)
      math(EXPR record_index "${record_index} + 1")
      continue()
    endif()

    if(line STREQUAL "</string_record>")
      set(in_string_record 0)
      continue()
    endif()

    if(in_string_record)
      string(REGEX MATCH "^<id>([^<]+)</id>$" m_id "${line}")
      if(m_id AND "${CMAKE_MATCH_1}" STREQUAL "${target_id}")
        set(found_index ${record_index})
        break()
      endif()
    endif()
  endforeach()

  set(${out_var} ${found_index} PARENT_SCOPE)
endfunction()

# Parse GX_RESOURCE_HEADER.
set(RES_HDR_SIZE 20)
read_u16_le(theme_count 4)
read_u32_le(theme_data_size 8)

if(NOT theme_count EQUAL 2)
  message(FATAL_ERROR "Unexpected theme_count: ${theme_count}")
endif()

# Byte-level string-table regression check:
# Ensure a known string ID lands at the expected binres string index, with correct
# length-prefix encoding and bytes, for both languages.
math(EXPR strhdr_lang_count_off "${string_hdr_off_ins} + 2")
read_u16_le(language_count_strhdr ${strhdr_lang_count_off})
math(EXPR strhdr_string_count_off "${string_hdr_off_ins} + 4")
read_u16_le(string_count_strhdr ${strhdr_string_count_off})
if(NOT language_count_strhdr EQUAL 2)
  message(FATAL_ERROR "Unexpected language_count in GX_STRING_HEADER. Expected 2, got ${language_count_strhdr}")
endif()

# Language 0 header immediately follows GX_STRING_HEADER.
math(EXPR lang0_hdr_off "${string_hdr_off_ins} + 10")
math(EXPR lang0_data_size_off "${lang0_hdr_off} + 68")
read_u32_le(lang0_data_size ${lang0_data_size_off})
math(EXPR lang0_data_off "${lang0_hdr_off} + 72")

# Assert language header names match the .gxp ordering (English, Spanish).
# GX_LANGUAGE_HEADER has a 64-byte name field, expected to be NUL-terminated.
math(EXPR lang0_name_off "${lang0_hdr_off} + 4")
expect_ascii_bytes_at_offset(${lang0_name_off} "456E676C69736800" "language0 name prefix")

# Language 1 header follows language 0 header + its data.
math(EXPR lang1_hdr_off "${lang0_data_off} + ${lang0_data_size}")
math(EXPR lang1_data_size_off "${lang1_hdr_off} + 68")
read_u32_le(lang1_data_size ${lang1_data_size_off})
math(EXPR lang1_data_off "${lang1_hdr_off} + 72")
math(EXPR lang1_name_off "${lang1_hdr_off} + 4")
expect_ascii_bytes_at_offset(${lang1_name_off} "5370616E69736800" "language1 name prefix")

set(target_id "STRING_17")
find_string_record_index(target_index "${GUIX_PROJECT}" "${target_id}")
if(target_index LESS 0)
  message(FATAL_ERROR "Unable to find ${target_id} in <string_table> of ${GUIX_PROJECT}")
endif()

assert_string_at_index(${lang0_data_off} ${string_count_strhdr} ${target_index} 9 "4C616E677561676573" "English ${target_id}")
assert_string_at_index(${lang1_data_off} ${string_count_strhdr} ${target_index} 7 "4964696F6D6173" "Spanish ${target_id}")

# Encoding/terminators sanity: empty translations must serialize as length=0 with no extra NUL.
# We test this by generating from a modified copy of the fixture .gxp where the Spanish
# translation of a known string is set to empty.
set(out_empty "${OUT_DIR}/empty_es")
file(MAKE_DIRECTORY "${out_empty}")
set(mod_project "${out_empty}/demo_guix_binres_empty_es.gxp")

get_filename_component(orig_project_dir "${GUIX_PROJECT}" DIRECTORY)

set(empty_target_id "STRING_12")
set(empty_target_spanish_value "temas 1")

file(STRINGS "${GUIX_PROJECT}" orig_lines)
set(wrote_empty 0)
set(in_string_table2 0)
set(in_string_record2 0)
set(is_target_record2 0)
set(mod_text "")
foreach(raw_line IN LISTS orig_lines)
  set(line "${raw_line}")
  string(STRIP "${line}" stripped)

  # Keep pixelmap assets resolvable even though this temporary .gxp lives under OUT_DIR.
  # Rewrite any relative <pathname> entries to absolute paths rooted at the original fixture.
  string(REGEX MATCH "^<pathname>([^<]+)</pathname>$" m_path "${stripped}")
  if(m_path)
    set(p "${CMAKE_MATCH_1}")
    string(REPLACE "\\" "/" p_norm "${p}")
    string(REGEX MATCH "^[A-Za-z]:[/\\].*" is_win_abs "${p}")
    if(NOT p_norm MATCHES "^/" AND NOT is_win_abs)
      set(line "<pathname>${orig_project_dir}/${p_norm}</pathname>")
    endif()
  endif()

  if(stripped STREQUAL "<string_table>")
    set(in_string_table2 1)
  endif()
  if(in_string_table2 AND stripped STREQUAL "<string_record>")
    set(in_string_record2 1)
    set(is_target_record2 0)
  endif()
  if(in_string_record2)
    if(stripped STREQUAL "<id>${empty_target_id}</id>")
      set(is_target_record2 1)
    endif()
    if(is_target_record2 AND stripped STREQUAL "<val>${empty_target_spanish_value}</val>")
      set(line "<val></val>")
      set(wrote_empty 1)
    endif()
  endif()
  if(in_string_record2 AND stripped STREQUAL "</string_record>")
    set(in_string_record2 0)
    set(is_target_record2 0)
  endif()
  if(in_string_table2 AND stripped STREQUAL "</string_table>")
    set(in_string_table2 0)
  endif()

  string(APPEND mod_text "${line}\n")
endforeach()

if(NOT wrote_empty)
  message(FATAL_ERROR "Failed to produce modified fixture with empty Spanish ${empty_target_id} translation")
endif()
file(WRITE "${mod_project}" "${mod_text}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${mod_project}" --output_path "${out_empty}" --binary --json
  RESULT_VARIABLE rv2
  OUTPUT_VARIABLE out2
  ERROR_VARIABLE err2
)

if(NOT rv2 EQUAL 0)
  message(FATAL_ERROR "generate --binary (empty-string variant) failed (rv=${rv2})\nstdout:\n${out2}\nstderr:\n${err2}\n")
endif()

string(REGEX MATCH "\"kind\"\\s*:\\s*\"binary\"\\s*,\\s*\"path\"\\s*:\\s*\"([^\"]+)\"" m2 "${out2}")
if(NOT m2)
  message(FATAL_ERROR "Unable to find binary output path in JSON (empty-string variant):\n${out2}")
endif()
set(bin2 "${CMAKE_MATCH_1}")
if(NOT EXISTS "${bin2}")
  message(FATAL_ERROR "Expected binary output not created (empty-string variant): ${bin2}")
endif()

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" binres-inspect --input "${bin2}" --json
  RESULT_VARIABLE rv_ins2
  OUTPUT_VARIABLE out_ins2
  ERROR_VARIABLE err_ins2
)

if(NOT rv_ins2 EQUAL 0)
  message(FATAL_ERROR "binres-inspect failed (empty-string variant) (rv=${rv_ins2})\nstdout:\n${out_ins2}\nstderr:\n${err_ins2}\n")
endif()

string(REGEX MATCH "\"string_header_offset\":([0-9]+)" m_str_off2 "${out_ins2}")
if(NOT m_str_off2)
  message(FATAL_ERROR "Unable to find string_header_offset in binres-inspect JSON (empty-string variant):\n${out_ins2}")
endif()
set(string_hdr_off_ins2 ${CMAKE_MATCH_1})

set(bin "${bin2}")
math(EXPR strhdr_lang_count_off2 "${string_hdr_off_ins2} + 2")
read_u16_le(language_count_strhdr2 ${strhdr_lang_count_off2})
math(EXPR strhdr_string_count_off2 "${string_hdr_off_ins2} + 4")
read_u16_le(string_count_strhdr2 ${strhdr_string_count_off2})
if(NOT language_count_strhdr2 EQUAL 2)
  message(FATAL_ERROR "Unexpected language_count in GX_STRING_HEADER (empty-string variant). Expected 2, got ${language_count_strhdr2}")
endif()

math(EXPR lang0_hdr_off2 "${string_hdr_off_ins2} + 10")
math(EXPR lang0_data_size_off2 "${lang0_hdr_off2} + 68")
read_u32_le(lang0_data_size2 ${lang0_data_size_off2})
math(EXPR lang0_data_off2 "${lang0_hdr_off2} + 72")
math(EXPR lang1_hdr_off2 "${lang0_data_off2} + ${lang0_data_size2}")
math(EXPR lang1_data_size_off2 "${lang1_hdr_off2} + 68")
read_u32_le(lang1_data_size2 ${lang1_data_size_off2})
math(EXPR lang1_data_off2 "${lang1_hdr_off2} + 72")

find_string_record_index(empty_index2 "${mod_project}" "${empty_target_id}")
if(empty_index2 LESS 0)
  message(FATAL_ERROR "Unable to find ${empty_target_id} in <string_table> of ${mod_project}")
endif()

# STRING_12 is the first record; next record is STRING_13 with Spanish "temas 2" (7 ASCII bytes).
assert_empty_string_at_index(${lang1_data_off2} ${string_count_strhdr2} ${empty_index2} 7 "Spanish empty ${empty_target_id}")

# Restore for remaining assertions which target the original generated binres.
set(bin "${bin_orig}")

# Validate theme 0 contains a non-empty color table.
if(NOT theme0_off EQUAL ${RES_HDR_SIZE})
  message(FATAL_ERROR "Unexpected theme0 offset from binres-inspect. Expected ${RES_HDR_SIZE}, got ${theme0_off}")
endif()

# Validate scrollbar appearance/styles are populated from the fixture .gxp.
# Offsets per `common/src/gx_binres_theme_load.c` read order.
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

# Validate font section is present and structurally sane.
math(EXPR theme0_font_count_off "${theme0_off} + 8")
read_u16_le(theme0_font_count ${theme0_font_count_off})
if(theme0_font_count LESS 1)
  message(FATAL_ERROR "Expected theme0_font_count >= 1, got ${theme0_font_count}")
endif()

math(EXPR theme0_font_data_size_off "${theme0_off} + 102")
read_u32_le(theme0_font_data_size ${theme0_font_data_size_off})
math(EXPR expected_font_data_size "${theme0_font_count} * 16")
if(NOT theme0_font_data_size EQUAL expected_font_data_size)
  message(FATAL_ERROR "Unexpected theme0_font_data_size. Expected ${expected_font_data_size}, got ${theme0_font_data_size}")
endif()

# First GX_FONT_HEADER should appear after GX_THEME_HEADER + color section.
math(EXPR theme0_color_data_size_off "${theme0_off} + 94")
read_u32_le(theme0_color_section_size ${theme0_color_data_size_off})
math(EXPR font0_off "${theme0_off} + 114 + ${theme0_color_section_size}")
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
math(EXPR theme0_pixelmap_count_off "${theme0_off} + 10")
read_u16_le(theme0_pixelmap_count ${theme0_pixelmap_count_off})
if(theme0_pixelmap_count LESS 1)
  message(FATAL_ERROR "Expected theme0_pixelmap_count >= 1, got ${theme0_pixelmap_count}")
endif()

math(EXPR theme0_pixelmap_data_size_off "${theme0_off} + 106")
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

# Studio-style dedup across themes: theme 1 may reference theme 0's pixelmap
# payload via a non-zero data_offset pointing at the referenced header.
read_u16_le(theme1_magic ${theme1_off})
if(NOT theme1_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_THEME_HEADER magic for theme1: ${theme1_magic}")
endif()

read_u16_le(pixelmap1_0_magic ${pixelmap1_0_off})
if(NOT pixelmap1_0_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_PIXELMAP_HEADER magic for theme1 pixelmap0: ${pixelmap1_0_magic}")
endif()

math(EXPR pixelmap1_0_data_offset_off "${pixelmap1_0_off} + 28")
read_u32_le(pixelmap1_0_data_offset ${pixelmap1_0_data_offset_off})
if(pixelmap1_0_data_offset EQUAL 0)
  message(FATAL_ERROR "Expected theme1 pixelmap0 data_offset to be non-zero (reference theme0 payload)")
endif()
if(NOT pixelmap1_0_data_offset EQUAL pixelmap0_off)
  message(FATAL_ERROR "Unexpected theme1 pixelmap0 data_offset. Expected ${pixelmap0_off}, got ${pixelmap1_0_data_offset}")
endif()

math(EXPR theme0_color_count_off "${theme0_off} + 4")
read_u16_le(theme0_color_count ${theme0_color_count_off})
if(theme0_color_count LESS 1)
  message(FATAL_ERROR "Expected theme0_color_count >= 1, got ${theme0_color_count}")
endif()

# Validate scrollbar color IDs are in-range and match expected IDs for this fixture.
math(EXPR vscroll_thumb_color_off "${theme0_off} + 37")
read_u32_le(vscroll_thumb_color ${vscroll_thumb_color_off})
if(vscroll_thumb_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "vscroll_thumb_color out of range. color_count=${theme0_color_count}, id=${vscroll_thumb_color}")
endif()
if(NOT vscroll_thumb_color EQUAL 0)
  message(FATAL_ERROR "Unexpected vscroll thumb color ID. Expected 0 (CANVAS), got ${vscroll_thumb_color}")
endif()

math(EXPR vscroll_button_color_off "${theme0_off} + 45")
read_u32_le(vscroll_button_color ${vscroll_button_color_off})
if(vscroll_button_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "vscroll_button_color out of range. color_count=${theme0_color_count}, id=${vscroll_button_color}")
endif()
if(NOT vscroll_button_color EQUAL 15)
  message(FATAL_ERROR "Unexpected vscroll button color ID. Expected 15 (SCROLL_BUTTON), got ${vscroll_button_color}")
endif()

math(EXPR hscroll_thumb_color_off "${theme0_off} + 74")
read_u32_le(hscroll_thumb_color ${hscroll_thumb_color_off})
if(hscroll_thumb_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "hscroll_thumb_color out of range. color_count=${theme0_color_count}, id=${hscroll_thumb_color}")
endif()
if(NOT hscroll_thumb_color EQUAL 0)
  message(FATAL_ERROR "Unexpected hscroll thumb color ID. Expected 0 (CANVAS), got ${hscroll_thumb_color}")
endif()

math(EXPR hscroll_button_color_off "${theme0_off} + 82")
read_u32_le(hscroll_button_color ${hscroll_button_color_off})
if(hscroll_button_color GREATER_EQUAL theme0_color_count)
  message(FATAL_ERROR "hscroll_button_color out of range. color_count=${theme0_color_count}, id=${hscroll_button_color}")
endif()
if(NOT hscroll_button_color EQUAL 15)
  message(FATAL_ERROR "Unexpected hscroll button color ID. Expected 15 (SCROLL_BUTTON), got ${hscroll_button_color}")
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

math(EXPR string_hdr_off_expected "${RES_HDR_SIZE} + ${theme_data_size}")
if(NOT string_hdr_off_expected EQUAL string_hdr_off_ins)
  message(FATAL_ERROR "Unexpected string header offset. Expected ${string_hdr_off_expected} from resource header, got ${string_hdr_off_ins} from binres-inspect")
endif()
set(string_hdr_off ${string_hdr_off_ins})

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
