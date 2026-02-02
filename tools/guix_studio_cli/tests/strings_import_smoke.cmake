# Smoke test for `guix_studio_cli import-strings` (CSV).

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

set(csv_path "${OUT_DIR}/strings.csv")
set(out_gxp "${OUT_DIR}/out.gxp")

# Minimal CSV (legacy Studio format): update a single string id in English and add/update French.
file(WRITE "${csv_path}" "name,en,fr\nSTRING_1,UPDATED_EN,UPDATED_FR\n")

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" import-strings --project "${GUIX_PROJECT}" --input "${csv_path}" --output "${out_gxp}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if(NOT rv EQUAL 0)
  message(FATAL_ERROR "import-strings failed (rv=${rv})\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

if(NOT EXISTS "${out_gxp}")
  message(FATAL_ERROR "Expected output project not created: ${out_gxp}\nstdout:\n${out}\nstderr:\n${err}\n")
endif()

file(READ "${out_gxp}" gxp_contents)
string(FIND "${gxp_contents}" "<id>STRING_1</id>" id_pos)
if(id_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing STRING_1 record")
endif()

string(FIND "${gxp_contents}" "<language>French</language>" fr_lang_pos)
if(fr_lang_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing newly added French language")
endif()

string(FIND "${gxp_contents}" "UPDATED_EN" en_val_pos)
if(en_val_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing updated English value")
endif()

string(FIND "${gxp_contents}" "UPDATED_FR" fr_val_pos)
if(fr_val_pos EQUAL -1)
  message(FATAL_ERROR "Output project missing updated French value")
endif()
