#include "gxp_project.h"

#include "studio_core/xml_dom.h"

namespace studio_core {

GxpParseResult parse_gxp_header(const std::string& path) {
    GxpParseResult r;

    const auto parsed = parse_xml_file(path);
    if (!parsed.ok) {
        r.ok = false;
        r.error = parsed.error;
        return r;
    }

    // Basic shape: <!DOCTYPE GUIX_Studio_Project> <project><header>...</header></project>
    // We avoid full validation here; that is handled by the CLI validate command.
    if (parsed.doc.root.name != "project") {
        r.ok = false;
        r.error = "Missing <project> root";
        return r;
    }

    const auto* header = parsed.doc.root.firstChild("header");
    if (!header) {
        r.ok = false;
        r.error = "Missing <header>";
        return r;
    }

    if (auto v = node_int(*header, "project_version")) r.header.project_version = *v;
    if (auto v = node_int(*header, "guix_version")) r.header.guix_version = *v;
    if (auto v = node_int(*header, "studio_version")) r.header.studio_version = *v;
    if (auto v = node_text(*header, "project_name")) {
        if (!v->empty()) r.header.project_name = *v;
    }

    if (auto v = node_int(*header, "target_cpu")) r.header.target_cpu = *v;
    if (auto v = node_int(*header, "target_tools")) r.header.target_tools = *v;
    if (auto v = node_bool(*header, "dave2d_graph_accelerator")) r.header.dave2d_graph_accelerator = *v;

    r.ok = true;
    return r;
}

} // namespace studio_core
