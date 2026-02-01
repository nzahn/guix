#pragma once

#include <optional>
#include <string>

namespace studio_core {

struct GxpHeader {
    std::optional<int> project_version;
    std::optional<int> guix_version;
    std::optional<int> studio_version;
    std::optional<std::string> project_name;

    std::optional<int> target_cpu;
    std::optional<int> target_tools;
    std::optional<bool> dave2d_graph_accelerator;
};

struct GxpParseResult {
    bool ok = false;
    std::string error;
    GxpHeader header;
};

GxpParseResult parse_gxp_header(const std::string& path);

} // namespace studio_core
