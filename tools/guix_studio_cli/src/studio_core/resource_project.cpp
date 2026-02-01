#include "resource_project.h"

#include "studio_core/xml_dom.h"

namespace studio_core {

ResourceProjectParseResult parse_resource_project_header(const std::string& path) {
    ResourceProjectParseResult r;

    const auto parsed = parse_xml_file(path);
    if (!parsed.ok) {
        r.ok = false;
        r.error = parsed.error;
        return r;
    }

    if (parsed.doc.root.name != "resource_project") {
        r.ok = false;
        r.error = "Missing <resource_project> root";
        return r;
    }

    const auto* header = parsed.doc.root.firstChild("header");
    if (!header) {
        r.ok = false;
        r.error = "Missing <header>";
        return r;
    }

    if (auto v = node_text(*header, "name")) {
        if (!v->empty()) r.header.name = *v;
    }
    if (auto v = node_int(*header, "version")) r.header.version = *v;
    if (auto v = node_text(*header, "converter")) {
        if (!v->empty()) r.header.converter = *v;
    }
    if (auto v = node_int(*header, "studio_version")) r.header.studio_version = *v;
    if (auto v = node_int(*header, "guix_version")) r.header.guix_version = *v;

    r.ok = true;
    return r;
}

} // namespace studio_core
