#pragma once

#include <string>
#include <vector>

namespace studio_core {

struct StringsExportXliffResult {
    bool ok = false;
    std::string error;
    int unit_count = 0;
    std::vector<std::string> warnings;
};

// Export string table to XLIFF.
// - `src_language` / `target_language` can be either a language name (e.g. "English")
//   or a language id (e.g. "en").
// - `version` is 1 or 2 (XLIFF 1.2 or 2.0).
StringsExportXliffResult export_strings_xliff_from_gxp(const std::string& gxp_path,
                                                      const std::string& out_xliff_path,
                                                      const std::string& src_language,
                                                      const std::string& target_language,
                                                      int version = 2);

struct StringsImportXliffResult {
    bool ok = false;
    std::string error;
    int updated_records = 0;
    int added_records = 0;
    int added_languages = 0;
    std::vector<std::string> warnings;
};

// Import translations from XLIFF into a project.
// - Adds the target language to the project if missing.
// - Updates (or creates) string records in the active display's string_table.
StringsImportXliffResult import_strings_xliff_to_gxp(const std::string& gxp_path,
                                                    const std::string& xliff_path,
                                                    const std::string& out_gxp_path);

} // namespace studio_core
