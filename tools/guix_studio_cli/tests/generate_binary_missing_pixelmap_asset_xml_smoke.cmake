# Negative smoke test for `guix_studio_cli generate --xml ... --binary` missing pixelmap assets.
#
# Verifies we fail fast with an actionable, path-specific error when a required
# pixelmap source file is missing in the resource-XML input flow.

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

get_filename_component(PROJECT_DIR "${GUIX_PROJECT}" DIRECTORY)

# Step 1: Export resource XML from the known-good fixture.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" export-resource-xml --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --json
  WORKING_DIRECTORY "${PROJECT_DIR}"
  RESULT_VARIABLE rv_export
  OUTPUT_VARIABLE out_export
  ERROR_VARIABLE err_export
)

if(NOT rv_export EQUAL 0)
  message(FATAL_ERROR "export-resource-xml failed (rv=${rv_export})\nstdout:\n${out_export}\nstderr:\n${err_export}\n")
endif()

# Extract the resource XML output path from JSON.
string(REGEX MATCH "\"ok\"\\s*:\\s*true\\s*,\\s*\"resource_xml\"\\s*:\\s*\"([^\"]+)\"" m_xml "${out_export}")
if(NOT m_xml)
  message(FATAL_ERROR "Unable to find resource_xml path in JSON:\n${out_export}")
endif()
set(xml "${CMAKE_MATCH_1}")

if(NOT EXISTS "${xml}")
  message(FATAL_ERROR "Expected resource XML output not created: ${xml}")
endif()

# Step 2: Copy and intentionally break one pixelmap pathname in the XML.
get_filename_component(XML_NAME "${xml}" NAME)
set(bad_xml "${OUT_DIR}/bad_${XML_NAME}")
file(COPY_FILE "${xml}" "${bad_xml}")

file(READ "${bad_xml}" xml_text)
set(replaced FALSE)

# Prefer a specific known fixture asset.
if(xml_text MATCHES "graphics\\\\radiobutton_on\\.png")
  string(REPLACE "graphics\\radiobutton_on.png" "graphics\\__MISSING__radiobutton_on.png" xml_text "${xml_text}")
  set(replaced TRUE)
elseif(xml_text MATCHES "graphics/radiobutton_on\\.png")
  string(REPLACE "graphics/radiobutton_on.png" "graphics/__MISSING__radiobutton_on.png" xml_text "${xml_text}")
  set(replaced TRUE)
elseif(xml_text MATCHES "radiobutton_on\\.png")
  string(REPLACE "radiobutton_on.png" "__MISSING__radiobutton_on.png" xml_text "${xml_text}")
  set(replaced TRUE)
endif()

if(NOT replaced)
  message(FATAL_ERROR "Unable to find expected pixelmap asset reference in resource XML to break:\n${xml}")
endif()

file(WRITE "${bad_xml}" "${xml_text}")

# Step 3: Generate binary from the broken XML.
execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" generate --xml "${bad_xml}" --output_path "${OUT_DIR}" --binary --json
  WORKING_DIRECTORY "${PROJECT_DIR}"
  RESULT_VARIABLE rv_gen
  OUTPUT_VARIABLE out_gen
  ERROR_VARIABLE err_gen
)

if(rv_gen EQUAL 0)
  message(FATAL_ERROR "Expected generate --xml --binary to fail for missing asset, but it succeeded.\nstdout:\n${out_gen}\nstderr:\n${err_gen}\n")
endif()

# Ensure the error is actionable and references missing pixelmap assets.
if(NOT err_gen MATCHES "Missing pixelmap source asset")
  message(FATAL_ERROR "Expected missing-asset error.\nrv=${rv_gen}\nstdout:\n${out_gen}\nstderr:\n${err_gen}\n")
endif()

# Ensure the error references the missing path.
if(NOT err_gen MATCHES "__MISSING__radiobutton_on\\.png")
  message(FATAL_ERROR "Expected error to reference the missing asset path.\nrv=${rv_gen}\nstdout:\n${out_gen}\nstderr:\n${err_gen}\n")
endif()
