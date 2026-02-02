#pragma once

#include <string>
#include <vector>

namespace studio_core {

struct ResourceXmlExportOptions {
    // Legacy CLI selects by display name(s). If neither is set, defaults to display_index==0.
    std::optional<std::string> display_name;
    std::optional<int> display_index;

    // If empty, exports resources from all themes (legacy default).
    // If non-empty, exports resources from the selected theme(s) only.
    std::vector<std::string> theme_names;
};

struct ResourceXmlExportResult {
    bool ok = false;
    std::string error;
    std::vector<std::string> warnings;
    int pixelmap_count = 0;
    int font_count = 0;
};

// Best-effort export of a GUIX Studio resource-project XML from a .gxp.
// The output schema matches what the legacy Studio writes in GenerateResourceXml().
ResourceXmlExportResult export_resource_xml_from_gxp(const std::string& gxp_path, const std::string& out_path);

ResourceXmlExportResult export_resource_xml_from_gxp(const std::string& gxp_path,
                                                     const std::string& out_path,
                                                     const ResourceXmlExportOptions& options);

} // namespace studio_core
