#pragma once

#include <string>
#include <vector>

namespace studio_core {

struct StringsExportCsvResult {
    bool ok = false;
    std::string error;
    std::vector<std::string> warnings;
    int record_count = 0;
    int language_count = 0;
};

// Exports in legacy GUIX Studio CSV format:
//   name,<srcLangId>,<targetLangId>...
// Language arguments may be a language name (e.g. "English") or id (e.g. "en").
StringsExportCsvResult export_strings_csv_from_gxp(const std::string& gxp_path,
                                                  const std::string& out_csv_path,
                                                  const std::string& src_language,
                                                  const std::vector<std::string>& target_languages);

struct StringsImportCsvResult {
    bool ok = false;
    std::string error;
    std::vector<std::string> warnings;
    int updated_records = 0;
    int added_records = 0;
    int added_languages = 0;
};

// Imports string table values from a CSV and writes an updated .gxp.
// Does not implicitly migrate project schema versions.
StringsImportCsvResult import_strings_csv_to_gxp(const std::string& gxp_path,
                                                const std::string& csv_path,
                                                const std::string& out_gxp_path);

} // namespace studio_core
