# Smoke test for `guix_studio_cli import-xliff`.

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

set(xlf_path "${OUT_DIR}/strings.xlf")
set(out_gxp "${OUT_DIR}/out.gxp")

# Minimal XLIFF 2.0: update a single string id; target language is not in project.
file(WRITE "${xlf_path}" "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n")
file(APPEND "${xlf_path}" "<xliff xmlns=\"urn:oasis:names:tc:xliff:document:2.0\" version=\"2.0\" srcLang=\"en\" trgLang=\"fr\">\n")
file(APPEND "${xlf_path}" "  <file id=\"f1\" original=\"dummy\">\n")
file(APPEND "${xlf_path}" "    <unit id=\"0\" name=\"STRING_1\">\n")
file(APPEND "${xlf_path}" "      <segment>\n")
file(APPEND "${xlf_path}" "        <source>prompt</source>\n")
file(APPEND "${xlf_path}" "        <target>UPDATED_FROM_XLIFF</target>\n")
file(APPEND "${xlf_path}" "      </segment>\n")
file(APPEND "${xlf_path}" "    </unit>\n")
file(APPEND "${xlf_path}" "  </file>\n")
file(APPEND "${xlf_path}" "</xliff>\n")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" import-xliff --project "${GUIX_PROJECT}" --input "${xlf_path}" --output "${out_gxp}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "import-xliff failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

if(NOT EXISTS "${out_gxp}")
  message(FATAL_ERROR "Expected output project not created: ${out_gxp}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

file(READ "${out_gxp}" gxp_contents)
string(FIND "${gxp_contents}" "UPDATED_FROM_XLIFF" val_pos)
if(val_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing updated XLIFF value")
endif()

# Ensure the target language was added.
string(FIND "${gxp_contents}" "<language>French</language>" lang_pos)
if(lang_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing added French language")
endif()
