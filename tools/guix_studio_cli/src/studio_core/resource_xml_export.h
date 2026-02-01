#pragma once

#include <string>
#include <vector>

namespace studio_core {

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

} // namespace studio_core
