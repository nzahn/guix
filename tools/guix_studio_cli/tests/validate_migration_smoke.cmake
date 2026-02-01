# Smoke test that validate previews migration for legacy fixtures.
# Inputs:
#  - GUIX_STUDIO_CLI: path to guix_studio_cli executable
#  - GUIX_PROJECT: path to a .gxp

if (NOT DEFINED GUIX_STUDIO_CLI)
  message(FATAL_ERROR "GUIX_STUDIO_CLI not set")
endif()
if (NOT DEFINED GUIX_PROJECT)
  message(FATAL_ERROR "GUIX_PROJECT not set")
endif()

execute_process(
  COMMAND "${GUIX_STUDIO_CLI}" validate --project "${GUIX_PROJECT}" --json
  RESULT_VARIABLE rv
  OUTPUT_VARIABLE out
  ERROR_VARIABLE err
)

if (NOT rv EQUAL 0)
  message(FATAL_ERROR "validate failed (rv=${rv})\nstdout: ${out}\nstderr: ${err}")
endif()

# Should mention migration preview changes for v55 fixtures.
string(FIND "${out}" "Migration change:" mig_pos)
if (mig_pos EQUAL -1)
  message(FATAL_ERROR "Expected validate --json output to include migration preview changes")
endif()
