#include "studio_core/gxp_migrate.h"

#include <functional>
#include <optional>
#include <unordered_map>
#include <vector>

namespace studio_core {

static bool is_space(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

static std::string trim_copy(const std::string& s) {
    size_t start = 0;
    while (start < s.size() && is_space(s[start])) start++;
    size_t end = s.size();
    while (end > start && is_space(s[end - 1])) end--;
    return s.substr(start, end - start);
}

static XmlNode* require_child(XmlNode& parent, const char* name, std::string& error) {
    if (auto* c = parent.firstChild(name)) return c;
    error = std::string("Missing <") + name + ">";
    return nullptr;
}

static std::optional<int> parse_int_opt(const std::string& s) {
    try {
        const auto t = trim_copy(s);
        size_t idx = 0;
        int v = std::stoi(t, &idx, 10);
        if (idx != t.size()) return std::nullopt;
        return v;
    } catch (...) {
        return std::nullopt;
    }
}

static const std::vector<std::string>& gx_color_format_names_v56() {
    // Mirror the GUIX color format constants in common/inc/gx_api.h.
    // Index 0 intentionally maps to empty string (meaning "no conversion").
    static const std::vector<std::string> k = {
        "",
        "GX_COLOR_FORMAT_MONOCHROME",
        "GX_COLOR_FORMAT_MONOCHROME_INVERTED",
        "GX_COLOR_FORMAT_2BIT_GRAY",
        "GX_COLOR_FORMAT_2BIT_GRAY_INVERTED",
        "GX_COLOR_FORMAT_4BIT_GRAY",
        "GX_COLOR_FORMAT_4BIT_GRAY_INVERTED",
        "GX_COLOR_FORMAT_4BIT_VGA",
        "GX_COLOR_FORMAT_8BIT_GRAY",
        "GX_COLOR_FORMAT_8BIT_GRAY_INVERTED",
        "GX_COLOR_FORMAT_8BIT_PALETTE",
        "GX_COLOR_FORMAT_8BIT_PACKED_PIXEL",
        "GX_COLOR_FORMAT_5551BGRX",
        "GX_COLOR_FORMAT_1555XRGB",
        "GX_COLOR_FORMAT_565RGB",
        "GX_COLOR_FORMAT_4444ARGB",
        "GX_COLOR_FORMAT_4444BGRA",
        "GX_COLOR_FORMAT_565BGR",
        "GX_COLOR_FORMAT_24RGB",
        "GX_COLOR_FORMAT_24BGR",
        "GX_COLOR_FORMAT_24XRGB",
        "GX_COLOR_FORMAT_24BGRX",
        "GX_COLOR_FORMAT_32ARGB",
        "GX_COLOR_FORMAT_32RGBA",
        "GX_COLOR_FORMAT_32ABGR",
        "GX_COLOR_FORMAT_32BGRA",
        "GX_COLOR_FORMAT_8BIT_ALPHAMAP",
    };
    return k;
}

static const std::unordered_map<int, std::string>& folder_id_names() {
    // Mirror GUIX Studio res_folder_ids backward-compat mapping.
    static const std::unordered_map<int, std::string> k = {
        {4096, "DEFAULT_COLOR_FOLDER"},
        {4097, "CUSTOM_COLOR_FOLDER"},
        {4098, "DEFAULT_FONT_FOLDER"},
        {4099, "CUSTOM_FONT_FOLDER"},
        {4100, "DEFAULT_PIXELMAP_FOLDER"},
        {4101, "CUSTOM_PIXELMAP_FOLDER"},
    };
    return k;
}

static void walk(XmlNode& node, const std::function<void(XmlNode&)>& visitor) {
    visitor(node);
    for (auto& c : node.children) {
        walk(c, visitor);
    }
}

GxpMigrationResult migrate_gxp_to_latest(XmlDocument& doc) {
    GxpMigrationResult r;

    // Basic sanity.
    if (doc.root.name != "project") {
        r.error = "Root element is not <project>";
        return r;
    }

    auto* header = doc.root.firstChild("header");
    if (!header) {
        r.error = "Missing <header>";
        return r;
    }

    auto* project_version_node = require_child(*header, "project_version", r.error);
    if (!project_version_node) return r;

    int current = 0;
    if (auto v = parse_int_opt(project_version_node->text)) {
        current = *v;
    } else {
        r.warnings.push_back("Non-integer <project_version>; forcing to latest");
        current = 0;
    }

    if (current < kLatestProjectVersion) {
        // Apply version-gated migrations (old -> 56).
        // The legacy Studio expects some fields to switch to string-based representations at v56.

        size_t folder_id_converted = 0;
        size_t color_format_converted = 0;
        size_t color_format_out_of_range = 0;

        walk(doc.root, [&](XmlNode& n) {
            if (n.name == "folder_id") {
                auto maybe_int = parse_int_opt(n.text);
                if (!maybe_int) return;
                const auto it = folder_id_names().find(*maybe_int);
                if (it == folder_id_names().end()) return;
                const auto trimmed = trim_copy(n.text);
                if (trimmed == it->second) return;
                n.text = it->second;
                folder_id_converted++;
                return;
            }

            if (n.name == "color_format") {
                auto maybe_int = parse_int_opt(n.text);
                if (!maybe_int) return;
                const int v = *maybe_int;
                const auto& table = gx_color_format_names_v56();
                if (v < 0 || static_cast<size_t>(v) >= table.size()) {
                    color_format_out_of_range++;
                    return;
                }
                const std::string& name = table[static_cast<size_t>(v)];
                const auto trimmed = trim_copy(n.text);
                if (trimmed == name) return;
                n.text = name;
                color_format_converted++;
                return;
            }
        });

        project_version_node->text = std::to_string(kLatestProjectVersion);
        r.changes.push_back("Updated <project_version> to " + std::to_string(kLatestProjectVersion));
        if (folder_id_converted) {
            r.changes.push_back("Normalized " + std::to_string(folder_id_converted) + " <folder_id> values to named constants");
        }
        if (color_format_converted) {
            r.changes.push_back("Normalized " + std::to_string(color_format_converted) + " <color_format> values to GX_COLOR_FORMAT_* names");
        }
        if (color_format_out_of_range) {
            r.warnings.push_back("Found " + std::to_string(color_format_out_of_range) + " <color_format> values out of known range; left unchanged");
        }
    }

    r.ok = true;
    return r;
}

} // namespace studio_core
