# Smoke test for `guix_studio_cli export-resource-xml`.
# Runs the CLI and asserts the resource XML is created and contains key fields.
# Inputs:
#  - GUIX_STUDIO_CLI: path to guix_studio_cli executable
#  - GUIX_PROJECT: path to a .gxp
#  - OUT_DIR: directory for generated outputs
# Optional:
#  - EXPECT_DISPLAY_COLOR_FORMAT: substring expected in the output

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
  COMMAND "${GUIX_STUDIO_CLI}" export-resource-xml --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "export-resource-xml failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

get_filename_component(project_stem "${GUIX_PROJECT}" NAME_WE)
set(resource_xml "${OUT_DIR}/${project_stem}.resource.xml")

if(NOT EXISTS "${resource_xml}")
  message(FATAL_ERROR "Expected resource XML not created: ${resource_xml}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

file(READ "${resource_xml}" xml_contents)

string(FIND "${xml_contents}" "<!DOCTYPE GUIX_Studio_Resource>" doctype_pos)
if(doctype_pos EQUAL -1)
  message(FATAL_ERROR "Resource XML missing expected doctype: ${resource_xml}")
endif()

# Version must be >=56.
string(FIND "${xml_contents}" "<version>56</version>" ver_pos)
if(ver_pos EQUAL -1)
  message(FATAL_ERROR "Resource XML missing expected <version>56</version> minimum")
endif()

# Must contain at least one resource entry.
string(FIND "${xml_contents}" "<resource>" res_pos)
if(res_pos EQUAL -1)
  message(FATAL_ERROR "Resource XML expected to contain at least one <resource> entry")
endif()

# Must contain pixelmaps or fonts.
string(FIND "${xml_contents}" "<type>PIXELMAP</type>" px_pos)
string(FIND "${xml_contents}" "<type>FONT</type>" font_pos)
if(px_pos EQUAL -1 AND font_pos EQUAL -1)
  message(FATAL_ERROR "Resource XML expected to contain at least one PIXELMAP or FONT resource")
endif()

if(DEFINED EXPECT_DISPLAY_COLOR_FORMAT)
  string(FIND "${xml_contents}" "<display_color_format>${EXPECT_DISPLAY_COLOR_FORMAT}</display_color_format>" cf_pos)
  if(cf_pos EQUAL -1)
    message(FATAL_ERROR "Expected display_color_format '${EXPECT_DISPLAY_COLOR_FORMAT}' not found")
  endif()
endif()
