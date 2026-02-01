#pragma once

#include <string>
#include <vector>

#include "studio_core/xml_dom.h"

namespace studio_core {

constexpr int kLatestProjectVersion = 56; // from guix_studio/StudioXProject.h

struct GxpMigrationResult {
    bool ok = false;
    std::string error;
    std::vector<std::string> warnings;
    std::vector<std::string> changes;
};

// Migrates a parsed GUIX Studio project in-memory to the latest supported schema.
// Policy: migration is explicit (caller decides whether to write back).
GxpMigrationResult migrate_gxp_to_latest(XmlDocument& doc);

} // namespace studio_core
