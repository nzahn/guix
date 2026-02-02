# Smoke test for `guix_studio_cli generate --binary --theme`.
#
# Verifies theme filtering affects the binary theme table, and that the
# selected theme still emits a parseable (non-empty) color table.

if(NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "GUIX_STUDIO_CLI not set")
endif()
if(NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "GUIX_PROJECT not set")
endif()
if(NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "OUT_DIR not set")
endif()
if(NOT DEFINED THEME_NAME)
  message(FATAL_ERROR "THEME_NAME not set")
endif()
if(NOT DEFINED EXPECT_THEME_ID)
  message(FATAL_ERROR "EXPECT_THEME_ID not set")
endif()

file(REMOVE_RECURSE "${OUT_DIR}")
file(MAKE_DIRECTORY "${OUT_DIR}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --binary --theme "${THEME_NAME}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "generate --binary --theme failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
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

# GX_RESOURCE_HEADER
set(RES_HDR_SIZE 20)
read_u16_le(theme_count 4)
read_u32_le(theme_data_size 8)

if(NOT theme_count EQUAL 1)
  message(FATAL_ERROR "Unexpected theme_count (theme filter should select one theme): ${theme_count}")
endif()

# GX_THEME_HEADER starts immediately after resource header.
set(THEME_HDR_SIZE 114)
set(theme0_off ${RES_HDR_SIZE})
read_u16_le(theme0_magic ${theme0_off})
math(EXPR theme0_index_off "${theme0_off} + 2")
read_u16_le(theme0_index ${theme0_index_off})

if(NOT theme0_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_THEME_HEADER magic: ${theme0_magic}")
endif()
if(NOT theme0_index EQUAL EXPECT_THEME_ID)
  message(FATAL_ERROR "Unexpected theme index. Expected ${EXPECT_THEME_ID}, got ${theme0_index}")
endif()

# Validate that theme 0 has a non-empty color table and color header.
math(EXPR theme0_color_count_off "${theme0_off} + 4")
read_u16_le(theme0_color_count ${theme0_color_count_off})
if(theme0_color_count LESS 1)
  message(FATAL_ERROR "Expected theme0_color_count >= 1, got ${theme0_color_count}")
endif()

math(EXPR color_hdr_off "${theme0_off} + ${THEME_HDR_SIZE}")
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

# Validate string header is reachable via resource header's theme_data_size.
math(EXPR string_hdr_off "${RES_HDR_SIZE} + ${theme_data_size}")
read_u16_le(str_magic ${string_hdr_off})
if(NOT str_magic EQUAL 0x4758)
  message(FATAL_ERROR "Unexpected GX_STRING_HEADER magic: ${str_magic}")
endif()
