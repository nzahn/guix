#include "studio_core/resource_xml_export.h"

#include <algorithm>
#include <cctype>
#include <unordered_map>
#include <optional>
#include <string>
#include <vector>

#include "studio_core/gxp_migrate.h"
#include "studio_core/xml_dom.h"
#include "studio_core/xml_writer.h"

namespace studio_core {

// Legacy constant: PROJECT_VERSION_INITIAL_RESOURCE_XML
constexpr int kMinimumResourceXmlVersion = 56;

static bool parse_bool_loose(const std::optional<std::string>& v, bool default_value) {
    if (!v) return default_value;
    std::string s = *v;
    for (auto& c : s) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    if (s == "TRUE" || s == "1") return true;
    if (s == "FALSE" || s == "0") return false;
    return default_value;
}

static std::optional<int> parse_int_loose(const std::optional<std::string>& v) {
    if (!v) return std::nullopt;
    try {
        size_t idx = 0;
        const int out = std::stoi(*v, &idx, 10);
        if (idx != v->size()) return std::nullopt;
        return out;
    } catch (...) {
        return std::nullopt;
    }
}

static std::string rotation_name_from_gxp(const std::optional<std::string>& rotation_angle) {
    if (!rotation_angle || rotation_angle->empty()) return "None";

    // gxp stores either legacy names ("None", "CW", ...) or degrees ("0", "90", ...).
    const auto s = *rotation_angle;
    if (s == "None" || s == "CW" || s == "CCW" || s == "FLIP") return s;

    if (s == "0") return "None";
    if (s == "90") return "CW";
    if (s == "270") return "CCW";
    if (s == "180") return "FLIP";

    // Some projects may serialize the numeric enum values directly.
    if (s == "1") return "CW";
    if (s == "2") return "CCW";
    if (s == "3") return "FLIP";

    return "None";
}

static std::string target_cpu_name_from_gxp(const std::optional<std::string>& v) {
    // Legacy Studio stores ints in .gxp and writes strings in resource XML.
    // For now we only map the most common fixture value 0 -> Generic.
    if (!v || v->empty()) return "Generic";
    if (*v == "0") return "Generic";
    return *v;
}

static std::string target_tools_name_from_gxp(const std::optional<std::string>& v) {
    if (!v || v->empty()) return "Generic";
    if (*v == "0") return "Generic";
    return *v;
}

static std::string display_color_format_name(const XmlNode& display_info) {
    const auto bits_per_pix = parse_int_loose(node_text(display_info, "bits_per_pix")).value_or(16);
    const bool packed_format = parse_bool_loose(node_text(display_info, "packed_format"), false);
    const bool format_555 = parse_bool_loose(node_text(display_info, "format_555"), false);
    const bool format_4444 = parse_bool_loose(node_text(display_info, "format_4444"), false);
    const bool format_332 = parse_bool_loose(node_text(display_info, "format_332"), false);
    const bool reverse_order = parse_bool_loose(node_text(display_info, "reverse_order"), false);

    switch (bits_per_pix) {
        case 1:
            return "GX_COLOR_FORMAT_MONOCHROME";
        case 4:
            return "GX_COLOR_FORMAT_4BIT_GRAY";
        case 8:
            return format_332 ? "GX_COLOR_FORMAT_8BIT_PACKED_PIXEL" : "GX_COLOR_FORMAT_8BIT_PALETTE";
        case 24:
            return packed_format ? "GX_COLOR_FORMAT_24RGB" : "GX_COLOR_FORMAT_24XRGB";
        case 32:
            return reverse_order ? "GX_COLOR_FORMAT_32BGRA" : "GX_COLOR_FORMAT_32ARGB";
        default:
            // 16bpp family
            if (format_4444) {
                return reverse_order ? "GX_COLOR_FORMAT_4444BGRA" : "GX_COLOR_FORMAT_4444ARGB";
            }
            if (format_555) {
                return reverse_order ? "GX_COLOR_FORMAT_5551BGRX" : "GX_COLOR_FORMAT_1555XRGB";
            }
            return reverse_order ? "GX_COLOR_FORMAT_565BGR" : "GX_COLOR_FORMAT_565RGB";
    }
}

struct FontPageRange {
    int first_char = 0;
    int last_char = 0;
};

static std::vector<FontPageRange> extract_enabled_font_pages(const XmlNode& res_node) {
    std::vector<FontPageRange> out;

    for (const auto* page : res_node.childrenNamed("font_page_data")) {
        // Case 1: XML-mode shape already: <font_page_data><first_char>..</first_char><last_char>..</last_char></font_page_data>
        if (page->firstChild("first_char") && page->firstChild("last_char") && !page->firstChild("enabled")) {
            auto first = parse_int_loose(node_text(*page, "first_char"));
            auto last = parse_int_loose(node_text(*page, "last_char"));
            if (first && last) out.push_back({*first, *last});
            continue;
        }

        // Case 2: Project shape: one <font_page_data> containing repeated enabled/first_char/last_char triplets.
        bool enabled = false;
        std::optional<int> first;
        std::optional<int> last;

        for (const auto& c : page->children) {
            if (c.name == "enabled") {
                enabled = parse_bool_loose(std::optional<std::string>(c.text), false);
                first.reset();
                last.reset();
                continue;
            }
            if (c.name == "first_char") {
                first = parse_int_loose(std::optional<std::string>(c.text));
                continue;
            }
            if (c.name == "last_char") {
                last = parse_int_loose(std::optional<std::string>(c.text));
                continue;
            }

            if (enabled && first && last) {
                out.push_back({*first, *last});
                first.reset();
                last.reset();
            }
        }
        if (enabled && first && last) {
            out.push_back({*first, *last});
        }
    }

    return out;
}

static void write_resource_common(XmlWriter& w, const XmlNode& res_node) {
    w.writeString("type", node_text(res_node, "type").value_or(""));
    w.writeString("name", node_text(res_node, "name").value_or(""));

    // pathinfo
    w.openTag("pathinfo");
    const auto* pathinfo = res_node.firstChild("pathinfo");
    if (pathinfo) {
        const auto pathname = node_text(*pathinfo, "pathname");
        if (pathname) w.writeString("pathname", *pathname);
        w.writeString("pathtype", node_text(*pathinfo, "pathtype").value_or("project_relative"));
    } else {
        w.writeString("pathtype", "project_relative");
    }
    w.closeTag("pathinfo");

    w.writeBool("compress", parse_bool_loose(node_text(res_node, "compress"), false));
}

static void export_font(XmlWriter& w, const XmlNode& res_node, ResourceXmlExportResult& r) {
    w.openTag("resource");
    write_resource_common(w, res_node);

    w.writeInt("height", parse_int_loose(node_text(res_node, "height")).value_or(0));
    w.writeInt("font_bits", parse_int_loose(node_text(res_node, "font_bits")).value_or(0));
    w.writeBool("font_kerning", parse_bool_loose(node_text(res_node, "font_kerning"), false));

    const auto pages = extract_enabled_font_pages(res_node);
    for (const auto& p : pages) {
        w.openTag("font_page_data");
        w.writeInt("first_char", p.first_char);
        w.writeInt("last_char", p.last_char);
        w.closeTag("font_page_data");
    }

    w.closeTag("resource");
    r.font_count++;
}

static void export_pixelmap(XmlWriter& w, const XmlNode& res_node, ResourceXmlExportResult& r) {
    w.openTag("resource");
    write_resource_common(w, res_node);

    w.writeBool("alpha", parse_bool_loose(node_text(res_node, "alpha"), false));
    w.writeBool("dither", parse_bool_loose(node_text(res_node, "dither"), false));
    w.writeBool("raw", parse_bool_loose(node_text(res_node, "raw"), false));

    // After migration, <color_format> should be GX_COLOR_FORMAT_* or empty.
    w.writeString("color_format", node_text(res_node, "color_format").value_or(""));

    w.writeString("palette_type", node_text(res_node, "palette_type").value_or("None"));

    w.closeTag("resource");
    r.pixelmap_count++;
}

static void walk_resources(const XmlNode& node, std::vector<const XmlNode*>& out) {
    if (node.name == "resource") {
        out.push_back(&node);
    }
    for (const auto& c : node.children) {
        walk_resources(c, out);
    }
}

static const XmlNode* select_display(const XmlNode& root, const ResourceXmlExportOptions& options) {
    const XmlNode* selected = nullptr;

    if (options.display_index) {
        for (const auto* d : root.childrenNamed("display_info")) {
            const auto idx = parse_int_loose(node_text(*d, "display_index")).value_or(0);
            if (idx == *options.display_index) {
                selected = d;
                break;
            }
        }
    }

    if (!selected && options.display_name && !options.display_name->empty()) {
        for (const auto* d : root.childrenNamed("display_info")) {
            const auto name = node_text(*d, "display_name");
            if (name && *name == *options.display_name) {
                selected = d;
                break;
            }
        }
    }

    if (!selected) {
        // Default to display 0 (matches fixtures and legacy defaults).
        for (const auto* d : root.childrenNamed("display_info")) {
            const auto idx = parse_int_loose(node_text(*d, "display_index")).value_or(0);
            if (idx == 0) {
                selected = d;
                break;
            }
        }
    }

    if (!selected) {
        // Fall back to first display_info if index isn't present/parseable.
        selected = root.firstChild("display_info");
    }

    return selected;
}

static std::unordered_map<std::string, const XmlNode*> map_theme_to_theme_data(const XmlNode& display_info) {
    std::unordered_map<std::string, const XmlNode*> out;
    const auto* theme_info = display_info.firstChild("theme_info");
    if (!theme_info) return out;

    std::optional<std::string> current_name;
    for (const auto& c : theme_info->children) {
        if (c.name == "theme_name") {
            if (!c.text.empty()) {
                current_name = c.text;
            } else {
                current_name.reset();
            }
            continue;
        }
        if (c.name == "theme_data") {
            if (current_name && !current_name->empty()) {
                out[*current_name] = &c;
            }
            continue;
        }
    }
    return out;
}

ResourceXmlExportResult export_resource_xml_from_gxp(const std::string& gxp_path, const std::string& out_path) {
    ResourceXmlExportOptions options;
    return export_resource_xml_from_gxp(gxp_path, out_path, options);
}

ResourceXmlExportResult export_resource_xml_from_gxp(const std::string& gxp_path,
                                                     const std::string& out_path,
                                                     const ResourceXmlExportOptions& options) {
    ResourceXmlExportResult r;

    auto parsed = parse_xml_file(gxp_path);
    if (!parsed.ok) {
        r.error = parsed.error;
        return r;
    }

    // Migrate to latest in-memory so we write v56-friendly schema fields.
    {
        auto mig = migrate_gxp_to_latest(parsed.doc);
        if (!mig.ok) {
            r.warnings.push_back("Migration failed: " + mig.error);
        } else {
            for (const auto& w : mig.warnings) r.warnings.push_back(w);
        }
    }

    if (parsed.doc.root.name != "project") {
        r.error = "Root element is not <project>";
        return r;
    }

    const auto* header = parsed.doc.root.firstChild("header");
    if (!header) {
        r.error = "Missing <header>";
        return r;
    }

    const auto project_name = node_text(*header, "project_name").value_or(std::string{});
    const int project_version = parse_int_loose(node_text(*header, "project_version")).value_or(0);
    const int studio_version = parse_int_loose(node_text(*header, "studio_version")).value_or(0);
    const int guix_version = parse_int_loose(node_text(*header, "guix_version")).value_or(0);

    const auto target_cpu_raw = node_text(*header, "target_cpu");
    const auto target_tools_raw = node_text(*header, "target_tools");
    const bool dave2d = parse_bool_loose(node_text(*header, "dave2d_graph_accelerator"), false);

    const int resource_xml_version = std::max(kMinimumResourceXmlVersion, project_version);

    const XmlNode* display = select_display(parsed.doc.root, options);
    if (!display) {
        r.error = "Missing <display_info>";
        return r;
    }

    const auto rotation = rotation_name_from_gxp(node_text(*display, "rotation_angle"));
    const auto display_cf = display_color_format_name(*display);

    XmlWriter w;
    std::string err;
    if (!w.openFile(out_path, &err)) {
        r.error = err;
        return r;
    }

    w.writeHeader("GUIX_Studio_Resource");

    w.openTag("resource_project");

    w.openTag("header");
    w.writeString("name", project_name.empty() ? std::string("resource_project") : project_name);
    w.writeInt("version", resource_xml_version);
    w.writeString("converter", "GUIX Studio");
    if (studio_version) w.writeInt("studio_version", studio_version);
    if (guix_version) w.writeInt("guix_version", guix_version);
    w.writeString("target_cpu", target_cpu_name_from_gxp(target_cpu_raw));
    w.writeString("target_tools", target_tools_name_from_gxp(target_tools_raw));
    w.writeBool("dave2d_graph_accelerator", dave2d);
    w.closeTag("header");

    w.openTag("display_info");
    w.writeString("display_color_format", display_cf);
    w.writeString("rotation_angle", rotation);
    w.closeTag("display_info");

    std::vector<const XmlNode*> res_nodes;
    if (options.theme_names.empty()) {
        // Legacy default: include all themes.
        walk_resources(*display, res_nodes);
    } else {
        // Filtered: include only requested themes.
        const auto theme_map = map_theme_to_theme_data(*display);
        for (const auto& t : options.theme_names) {
            auto it = theme_map.find(t);
            if (it != theme_map.end() && it->second) {
                walk_resources(*it->second, res_nodes);
            }
        }
    }

    for (const auto* res : res_nodes) {
        const auto type = node_text(*res, "type");
        if (!type) continue;

        if (*type == "FONT") {
            export_font(w, *res, r);
        } else if (*type == "PIXELMAP") {
            export_pixelmap(w, *res, r);
        }
    }

    w.closeTag("resource_project");
    w.closeFile();

    r.ok = true;
    return r;
}

} // namespace studio_core
