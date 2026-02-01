#pragma once

#include <optional>
#include <string>

namespace studio_core {

struct ResourceProjectHeader {
    std::optional<std::string> name;
    std::optional<int> version;
    std::optional<std::string> converter;
    std::optional<int> studio_version;
    std::optional<int> guix_version;
};

struct ResourceProjectParseResult {
    bool ok = false;
    std::string error;
    ResourceProjectHeader header;
};

ResourceProjectParseResult parse_resource_project_header(const std::string& path);

} // namespace studio_core
