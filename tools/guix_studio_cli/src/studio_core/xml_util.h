#pragma once

#include <string>

namespace studio_core {

inline std::string xml_unescape(std::string s) {
    // Mirror the legacy Studio behavior (handles a small fixed set).
    auto replace_all = [&](const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = s.find(from, pos)) != std::string::npos) {
            s.replace(pos, from.size(), to);
            pos += to.size();
        }
    };

    replace_all("&amp;", "&");
    replace_all("&quot;", "\"");
    replace_all("&apos;", "'");
    replace_all("&lt;", "<");
    replace_all("&gt;", ">");
    return s;
}

inline std::string xml_escape(std::string s) {
    // Order matters: escape '&' first.
    auto replace_all = [&](const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = s.find(from, pos)) != std::string::npos) {
            s.replace(pos, from.size(), to);
            pos += to.size();
        }
    };

    replace_all("&", "&amp;");
    replace_all("\"", "&quot;");
    replace_all("'", "&apos;");
    replace_all("<", "&lt;");
    replace_all(">", "&gt;");
    return s;
}

} // namespace studio_core
