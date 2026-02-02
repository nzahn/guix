cmake_minimum_required(VERSION 3.16)

project(guix_studio_cli LANGUAGES CXX)

add_library(studio_core STATIC
  src/studio_core/language_registry.cpp
  src/studio_core/gxp_project.cpp
  src/studio_core/gxp_migrate.cpp
  src/studio_core/resource_project.cpp
  src/studio_core/resource_xml_export.cpp
  src/studio_core/strings_csv.cpp
  src/studio_core/strings_xliff.cpp
  src/studio_core/xml_dom.cpp
  src/studio_core/xml_reader.cpp
  src/studio_core/xml_writer.cpp
)

target_include_directories(studio_core PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_features(studio_core PRIVATE cxx_std_17)

add_executable(guix_studio_cli
    src/main.cpp
)

target_compile_features(guix_studio_cli PRIVATE cxx_std_17)

target_link_libraries(guix_studio_cli PRIVATE studio_core)

# Keep warnings reasonable across compilers.
if (MSVC)
  target_compile_options(guix_studio_cli PRIVATE /W4)
else()
  target_compile_options(guix_studio_cli PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(studio_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

include(CTest)
if (BUILD_TESTING)
  enable_testing()

  # When building this tool standalone, CMAKE_SOURCE_DIR points at tools/guix_studio_cli.
  # Compute the GUIX repo root so our tests can find fixtures under /samples.
  get_filename_component(GUIX_REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)

  add_test(
    NAME guix_studio_cli_summary_guix_simple
    COMMAND $<TARGET_FILE:guix_studio_cli> summary --project ${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp --json
  )

  add_test(
    NAME guix_studio_cli_validate_guix_simple
    COMMAND $<TARGET_FILE:guix_studio_cli> validate --project ${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp --json
  )

  add_test(
    NAME guix_studio_cli_validate_previews_migration_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/validate_migration_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/generate_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_guix_simple_filters
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_filters
      -DDISPLAY_FILTERS=main_display
      -DTHEME_FILTERS=theme_1
      -DLANGUAGE_FILTERS=English
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/generate_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_guix_simple_flags_no_args
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_flags_no_args
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/generate_flags_no_args.cmake
  )

  add_test(
    NAME guix_studio_cli_export_strings_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_strings
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/strings_export_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_import_strings_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_strings_import
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/strings_import_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_export_xliff_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_xliff
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/xliff_export_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_import_xliff_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_xliff_import
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/xliff_import_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_export
      -DEXPECT_DISPLAY_COLOR_FORMAT=GX_COLOR_FORMAT_24XRGB
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/export_resource_xml_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_golden_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_export_guix_simple
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/guix_simple.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_resource_xml_golden_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_generate_guix_simple
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/guix_simple.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_generate_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_export
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/export_resource_xml_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_golden_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_export_demo_guix_washing_machine
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/demo_guix_washing_machine.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_resource_xml_golden_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_generate_demo_guix_washing_machine
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/demo_guix_washing_machine.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_generate_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/migrate_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out
      -DEXPECT_PRESENT=<folder_id>DEFAULT_COLOR_FOLDER</folder_id>;<color_format>GX_COLOR_FORMAT_8BIT_ALPHAMAP</color_format>
      -DEXPECT_ABSENT=<folder_id>4096</folder_id>;<color_format>26</color_format>
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/migrate_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_idempotent_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_idempotent
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/migrate_idempotent.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_idempotent_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_idempotent
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/migrate_idempotent.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_golden_guix_simple
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_simple/guix_simple.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_migrate_guix_simple
      -DGOLDEN_GXP=${CMAKE_CURRENT_LIST_DIR}/tests/golden_migration/guix_simple.migrated.gxp
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_migrate_gxp.cmake
  )

  add_test(
    NAME guix_studio_cli_migrate_golden_demo_guix_washing_machine
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/samples/demo_guix_washing_machine/demo_guix_washing_machine.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_migrate_demo_guix_washing_machine
      -DGOLDEN_GXP=${CMAKE_CURRENT_LIST_DIR}/tests/golden_migration/demo_guix_washing_machine.migrated.gxp
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_migrate_gxp.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_golden_demo_guix_binres_standalone
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_export_demo_guix_binres_standalone
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/demo_guix_binres_standalone.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_demo_guix_binres_standalone_filters
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_export_filters_demo_guix_binres_standalone
      -DDISPLAY_FILTER=main_display
      -DTHEME_FILTERS=theme_1
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/export_resource_xml_filters_smoke.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_resource_xml_golden_demo_guix_binres_standalone
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/tutorials/demo_guix_binres_standalone/demo_guix_binres_standalone.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_generate_demo_guix_binres_standalone
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/demo_guix_binres_standalone.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_generate_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_export_resource_xml_golden_all_widgets_5_3_3
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/test/example_internal/all_widgets_5_3_3/all_widgets_5_3_3.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_export_all_widgets_5_3_3
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/all_widgets_5_3_3.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_resource_xml.cmake
  )

  add_test(
    NAME guix_studio_cli_generate_resource_xml_golden_all_widgets_5_3_3
    COMMAND ${CMAKE_COMMAND}
      -DGUIX_STUDIO_CLI=$<TARGET_FILE:guix_studio_cli>
      -DGUIX_PROJECT=${GUIX_REPO_ROOT}/test/example_internal/all_widgets_5_3_3/all_widgets_5_3_3.gxp
      -DOUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/ctest_out_golden_generate_all_widgets_5_3_3
      -DGOLDEN_XML=${CMAKE_CURRENT_LIST_DIR}/tests/golden/all_widgets_5_3_3.resource.xml
      -P ${CMAKE_CURRENT_LIST_DIR}/tests/compare_golden_generate_resource_xml.cmake
  )
endif()
