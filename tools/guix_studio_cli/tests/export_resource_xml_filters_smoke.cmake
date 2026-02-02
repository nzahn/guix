# Smoke test for `guix_studio_cli export-resource-xml` with display/theme filters.

if(NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "GUIX_STUDIO_CLI not set")
endif()
if(NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "GUIX_PROJECT not set")
endif()
if(NOT DEFINED OUT_DIR)
  message(FATAL_ERROR "OUT_DIR not set")
endif()
if(NOT DEFINED DISPLAY_FILTER)
  message(FATAL_ERROR "DISPLAY_FILTER not set")
endif()
if(NOT DEFINED THEME_FILTERS)
  message(FATAL_ERROR "THEME_FILTERS not set")
endif()

file(REMOVE_RECURSE "${OUT_DIR}")
file(MAKE_DIRECTORY "${OUT_DIR}")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" export-resource-xml --project "${GUIX_PROJECT}" --output_path "${OUT_DIR}" --display "${DISPLAY_FILTER}" --theme "${THEME_FILTERS}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "export-resource-xml failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

# Expected naming policy: <project_name>.resource.xml
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
