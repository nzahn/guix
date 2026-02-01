#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include "studio_core/gxp_migrate.h"
#include "studio_core/gxp_project.h"
#include "studio_core/resource_project.h"
#include "studio_core/resource_xml_export.h"
#include "studio_core/xml_dom.h"
#include "studio_core/xml_writer.h"

namespace {

constexpr const char* kVersion = "0.1.0";

struct ProjectHeader {
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;
    std::optional<std::string> project_name;
};

constexpr int kMinimumResourceXmlVersion = 56; // PROJECT_VERSION_INITIAL_RESOURCE_XML

ProjectHeader parse_project_header(const std::string& gxp_path) {
    ProjectHeader header;
    const auto parsed = studio_core::parse_gxp_header(gxp_path);
    if (!parsed.ok) {
        return header;
    }

    if (parsed.header.project_version) header.project_version = std::to_string(*parsed.header.project_version);
    if (parsed.header.guix_version) header.guix_version = std::to_string(*parsed.header.guix_version);
    if (parsed.header.studio_version) header.studio_version = std::to_string(*parsed.header.studio_version);
    if (parsed.header.project_name) header.project_name = *parsed.header.project_name;
    return header;
}

std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c; break;
        }
    }
    return out;
}

std::optional<int> parse_int(const std::optional<std::string>& s) {
    if (!s || s->empty()) {
        return std::nullopt;
    }
    try {
        size_t idx = 0;
        int val = std::stoi(*s, &idx, 10);
        if (idx != s->size()) {
            return std::nullopt;
        }
        return val;
    } catch (...) {
        return std::nullopt;
    }
}

void print_usage(std::ostream& os) {
    os << "guix_studio_cli " << kVersion << "\n\n";
    os << "Phase-1 scaffolding CLI for the GUIX Studio VS Code extension.\n";
    os << "This currently supports best-effort project summaries, validation, and a minimal output generator.\n\n";
    os << "Usage:\n";
    os << "  guix_studio_cli --version\n";
    os << "  guix_studio_cli help\n";
    os << "  guix_studio_cli summary --project <path.gxp> [--json]\n";
    os << "  guix_studio_cli validate --project <path.gxp> [--json]\n\n";

    os << "  guix_studio_cli migrate --project <path.gxp> [--output <path.gxp> | --in-place] [--json]\n\n";

    os << "  guix_studio_cli export-resource-xml --project <path.gxp> [--output_path <dir>] [--json]\n";
    os << "  guix_studio_cli generate --project <path.gxp> [--output_path <dir>] [--json]\n\n";
    os << "Notes:\n";
    os << "  - This is NOT a full replacement for the legacy Studio generator yet.\n";
    os << "  - Phase 1 generation currently exports a minimal resource-project XML only.\n";
    os << "  - Future phases will implement Studio-compatible C/spec/bin/srec outputs.\n";
}

std::optional<std::string> arg_value(const std::vector<std::string>& args, const std::string& flag) {
    for (size_t i = 0; i < args.size(); i++) {
        if (args[i] == flag && i + 1 < args.size()) {
            return args[i + 1];
        }
    }
    return std::nullopt;
}

bool has_flag(const std::vector<std::string>& args, const std::string& flag) {
    for (const auto& a : args) {
        if (a == flag) return true;
    }
    return false;
}

std::optional<std::string> arg_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        auto v = arg_value(args, f);
        if (v) {
            return v;
        }
    }
    return std::nullopt;
}

bool has_flag_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        if (has_flag(args, f)) {
            return true;
        }
    }
    return false;
}

int cmd_migrate(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const bool in_place = has_flag_any(args, {"--in-place"});
    const auto output_arg = arg_value_any(args, {"--output"});

    if (in_place && output_arg) {
        std::cerr << "Use only one of --output or --in-place\n";
        return 2;
    }

    std::filesystem::path out_path;
    if (in_place) {
        out_path = std::filesystem::path(*project);
    } else if (output_arg) {
        out_path = std::filesystem::path(*output_arg);
    } else {
        std::filesystem::path in_path(*project);
        out_path = in_path;
        out_path.replace_filename(in_path.stem().string() + ".migrated" + in_path.extension().string());
    }

    auto parsed = studio_core::parse_xml_file(*project);
    if (!parsed.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(parsed.error) << "\"}\n";
            return 1;
        }
        std::cerr << parsed.error << "\n";
        return 1;
    }

    auto mig = studio_core::migrate_gxp_to_latest(parsed.doc);
    if (!mig.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(mig.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << mig.error << "\n";
        return 1;
    }

    std::string err;
    if (!studio_core::write_xml_file(out_path.string(), parsed.doc, &err)) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(err) << "\"}\n";
            return 2;
        }
        std::cerr << err << "\n";
        return 2;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";

        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < mig.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(mig.warnings[i]) << "\"";
        }
        std::cout << "]";

        std::cout << ",\"changes\":[";
        for (size_t i = 0; i < mig.changes.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(mig.changes[i]) << "\"";
        }
        std::cout << "]";

        std::cout << "}\n";
        return 0;
    }

    std::cout << "Wrote migrated project: " << out_path.string() << "\n";
    for (const auto& c : mig.changes) {
        std::cout << "  change: " << c << "\n";
    }
    for (const auto& w : mig.warnings) {
        std::cout << "  warning: " << w << "\n";
    }
    return 0;
}

std::filesystem::path default_output_dir_for_project(const std::filesystem::path& project_path) {
    auto parent = project_path.parent_path();
    if (parent.empty()) {
        return std::filesystem::current_path();
    }
    return parent;
}

int cmd_export_resource_xml(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output_path_arg = arg_value(args, "--output_path");
    const bool json = has_flag(args, "--json");

    const auto header = parse_project_header(*project);
    if (!header.project_name || header.project_name->empty()) {
        std::cerr << "Missing <project_name>\n";
        return 1;
    }

    std::filesystem::path project_path_fs(*project);
    std::filesystem::path out_dir = output_path_arg ? std::filesystem::path(*output_path_arg)
                                                    : default_output_dir_for_project(project_path_fs);

    std::error_code ec;
    std::filesystem::create_directories(out_dir, ec);
    if (ec) {
        std::cerr << "Failed to create output directory: " << out_dir.string() << "\n";
        return 2;
    }

    const std::filesystem::path out_file = out_dir / (header.project_name.value() + ".resource.xml");

    const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string());
    if (!exported.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(exported.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << exported.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true,\"resource_xml\":\"" << json_escape(out_file.string()) << "\"";
        std::cout << ",\"pixelmaps\":" << exported.pixelmap_count;
        std::cout << ",\"fonts\":" << exported.font_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < exported.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(exported.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote resource project XML: " << out_file.string() << "\n";
    return 0;
}

int cmd_generate(const std::vector<std::string>& args) {
    // Phase 1: implement legacy-ish CLI semantics but generate stub artifacts.
    // This lets the VS Code extension build UX without waiting for full generator parity.

    const auto project = arg_value_any(args, {"--project", "-p"});
    const auto xml_in = arg_value_any(args, {"--xml", "-x"});
    const auto output_path_arg = arg_value_any(args, {"--output_path"});
    const bool json = has_flag_any(args, {"--json"});

    const auto resource_out = arg_value_any(args, {"--resource", "-r"});
    const auto spec_out = arg_value_any(args, {"--specification", "-s"});
    const bool binary = has_flag_any(args, {"--binary", "-b"});
    const bool big_endian = has_flag_any(args, {"--big_endian"});
    const bool no_res_header = has_flag_any(args, {"--no_res_header"});

    if (!project && !xml_in) {
        std::cerr << "Missing required flag: --project/-p or --xml/-x\n";
        return 2;
    }

    // Resolve output dir.
    std::filesystem::path out_dir;
    if (output_path_arg) {
        out_dir = std::filesystem::path(*output_path_arg);
    } else if (project) {
        out_dir = default_output_dir_for_project(std::filesystem::path(*project));
    } else {
        out_dir = std::filesystem::current_path();
    }

    std::error_code ec;
    std::filesystem::create_directories(out_dir, ec);
    if (ec) {
        std::cerr << "Failed to create output directory: " << out_dir.string() << "\n";
        return 2;
    }

    // Determine project name if possible.
    std::optional<std::string> project_name;
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;

    if (project) {
        const auto header = parse_project_header(*project);
        project_name = header.project_name;
        project_version = header.project_version;
        guix_version = header.guix_version;
        studio_version = header.studio_version;
    }

    if (!project_name || project_name->empty()) {
        // Fall back to filename base.
        if (project) {
            project_name = std::filesystem::path(*project).stem().string();
        } else if (xml_in) {
            project_name = std::filesystem::path(*xml_in).stem().string();
        }
    }

    if (!project_name || project_name->empty()) {
        std::cerr << "Unable to determine project name\n";
        return 1;
    }

    // Phase 1 default behavior: if no specific outputs requested, behave like before and emit resource XML.
    const bool any_requested = (resource_out.has_value() || spec_out.has_value() || binary);

    struct PlannedOutput {
        std::string kind;
        std::filesystem::path path;
    };
    std::vector<PlannedOutput> outputs;

    std::filesystem::path resource_xml_path;
    if (!xml_in) {
        // We need a resource XML (either explicitly requested or as input for binary generation, or for backward-compatible behavior).
        const std::filesystem::path out_file = out_dir / (*project_name + ".resource.xml");
        if (project) {
            const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string());
            if (!exported.ok) {
                std::cerr << exported.error << "\n";
                return 1;
            }
        } else {
            // No .gxp available; fall back to a minimal resource XML.
            std::string err;
            studio_core::XmlWriter writer;
            if (!writer.openFile(out_file.string(), &err)) {
                std::cerr << err << "\n";
                return 2;
            }
            writer.writeHeader("GUIX_Studio_Resource");
            writer.openTag("resource_project");
            writer.openTag("header");
            writer.writeString("name", *project_name);
            writer.writeInt("version", kMinimumResourceXmlVersion);
            writer.writeString("converter", "GUIX Studio");
            writer.writeString("target_cpu", "Generic");
            writer.writeString("target_tools", "Generic");
            writer.writeBool("dave2d_graph_accelerator", false);
            writer.closeTag("header");
            writer.openTag("display_info");
            writer.writeString("display_color_format", "GX_COLOR_FORMAT_565RGB");
            writer.writeString("rotation_angle", "None");
            writer.closeTag("display_info");
            writer.closeTag("resource_project");
            writer.closeFile();
        }

        resource_xml_path = out_file;
    } else {
        // Validate the input is a resource project like legacy Studio.
        const auto rp = studio_core::parse_resource_project_header(*xml_in);
        if (!rp.ok) {
            std::cerr << rp.error << "\n";
            return 1;
        }
        if (!rp.header.version || *rp.header.version < kMinimumResourceXmlVersion) {
            std::cerr << "Invalid resource project version\n";
            return 1;
        }
        if (!rp.header.converter || *rp.header.converter != "GUIX Studio") {
            std::cerr << "Unknown converter\n";
            return 1;
        }
        resource_xml_path = std::filesystem::path(*xml_in);
    }

    // Back-compat: always report resource_xml when we created/used one.
    if (!resource_xml_path.empty()) {
        outputs.push_back({"resource_xml", resource_xml_path});
    }

    // Resource/spec outputs are file-path arguments in legacy Studio.
    if (resource_out) {
        std::filesystem::path p(*resource_out);
        if (p.is_relative()) {
            p = out_dir / p;
        }
        outputs.push_back({"resource_c", p});
    } else if (!any_requested) {
        // If user didn't request anything, keep Phase 1 behavior (resource XML only).
    }

    if (spec_out) {
        std::filesystem::path p(*spec_out);
        if (p.is_relative()) {
            p = out_dir / p;
        }
        outputs.push_back({"specification", p});
    }

    if (binary) {
        std::filesystem::path p = out_dir / (*project_name + ".bin");
        outputs.push_back({"binary", p});
    }

    // Emit stub files for requested outputs.
    for (const auto& o : outputs) {
        if (o.kind == "resource_xml") {
            continue; // already written or provided
        }
        std::ofstream f(o.path, std::ios::binary);
        if (!f) {
            std::cerr << "Unable to open output file: " << o.path.string() << "\n";
            return 2;
        }

        if (o.kind == "resource_c") {
            f << "/* Phase 1 stub: resource C output not implemented yet. */\n";
            f << "/* Project: " << *project_name << " */\n";
            f << "/* Generated from: " << (project ? *project : resource_xml_path.string()) << " */\n";
        } else if (o.kind == "specification") {
            f << "# Phase 1 stub: specification output not implemented yet\n";
            f << "project: " << *project_name << "\n";
        } else if (o.kind == "binary") {
            // A deterministic placeholder. Later phases will generate real binres.
            f << "GUIXSTUB";
            f << "\n";
            f << "big_endian=" << (big_endian ? "true" : "false") << "\n";
            f << "no_res_header=" << (no_res_header ? "true" : "false") << "\n";
            f << "xml=" << resource_xml_path.string() << "\n";
        }
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project_name\":\"" << json_escape(*project_name) << "\"";
        if (!resource_xml_path.empty()) {
            std::cout << ",\"resource_xml\":\"" << json_escape(resource_xml_path.string()) << "\"";
        }
        std::cout << ",\"outputs\":[";
        for (size_t i = 0; i < outputs.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"kind\":\"" << json_escape(outputs[i].kind) << "\",\"path\":\"";
            std::cout << json_escape(outputs[i].path.string()) << "\"}";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    for (const auto& o : outputs) {
        std::cout << "Wrote " << o.kind << ": " << o.path.string() << "\n";
    }
    return 0;
}

int cmd_summary(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto header = parse_project_header(*project);
    const bool json = has_flag(args, "--json");

    if (json) {
        auto j = [&](const char* key, const std::optional<std::string>& val) {
            if (!val) {
                std::cout << "\"" << key << "\":null";
            } else {
                std::cout << "\"" << key << "\":\"" << json_escape(*val) << "\"";
            }
        };

        std::cout << "{";
        j("project", *project);
        std::cout << ",";
        j("project_version", header.project_version);
        std::cout << ",";
        j("guix_version", header.guix_version);
        std::cout << ",";
        j("studio_version", header.studio_version);
        std::cout << ",";
        j("project_name", header.project_name);
        std::cout << "}\n";
        return 0;
    }

    std::cout << "Project: " << *project << "\n";
    std::cout << "  project_name: " << (header.project_name ? *header.project_name : "<missing>") << "\n";
    std::cout << "  project_version: " << (header.project_version ? *header.project_version : "<missing>") << "\n";
    std::cout << "  guix_version: " << (header.guix_version ? *header.guix_version : "<missing>") << "\n";
    std::cout << "  studio_version: " << (header.studio_version ? *header.studio_version : "<missing>") << "\n";
    return 0;
}

int cmd_validate(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const bool json = has_flag(args, "--json");

    auto emit_json = [&](bool ok, const std::vector<std::string>& errors, const std::vector<std::string>& warnings) {
        std::cout << "{\"ok\":" << (ok ? "true" : "false") << ",\"errors\":[";
        for (size_t i = 0; i < errors.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(errors[i]) << "\"";
        }
        std::cout << "],\"warnings\":[";
        for (size_t i = 0; i < warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(warnings[i]) << "\"";
        }
        std::cout << "]}\n";
    };

    // Small but real validation: parse XML, check basic schema shape, and
    // preview in-memory migration to latest (explicit on-disk migration is a
    // separate command).
    std::vector<std::string> errors;
    std::vector<std::string> warnings;

    auto parsed = studio_core::parse_xml_file(*project);
    if (!parsed.ok) {
        errors.emplace_back(parsed.error);
    } else {
        if (parsed.doc.doctype.find("GUIX_Studio_Project") == std::string::npos) {
            errors.emplace_back("Not a GUIX_Studio_Project (.gxp) file (missing/unknown doctype)");
        }

        if (parsed.doc.root.name != "project") {
            errors.emplace_back("Root element is not <project>");
        } else {
            const auto* header_node = parsed.doc.root.firstChild("header");
            if (!header_node) {
                errors.emplace_back("Missing <header>");
            } else {
                const auto project_name = studio_core::node_text(*header_node, "project_name");
                if (!project_name || project_name->empty()) {
                    errors.emplace_back("Missing <project_name>");
                }

                const auto project_version = studio_core::node_text(*header_node, "project_version");
                std::optional<int> project_version_int;
                if (!project_version || project_version->empty()) {
                    errors.emplace_back("Missing <project_version>");
                } else {
                    project_version_int = parse_int(project_version);
                    if (!project_version_int) {
                        warnings.emplace_back("Non-integer <project_version>");
                    } else if (*project_version_int < studio_core::kLatestProjectVersion) {
                        warnings.emplace_back("Project version is older than latest; run 'migrate' to update on disk");
                    }
                }

                const auto guix_version = studio_core::node_text(*header_node, "guix_version");
                if (guix_version && !guix_version->empty() && !parse_int(guix_version)) {
                    warnings.emplace_back("Non-integer <guix_version>");
                }

                const auto studio_version = studio_core::node_text(*header_node, "studio_version");
                if (studio_version && !studio_version->empty() && !parse_int(studio_version)) {
                    warnings.emplace_back("Non-integer <studio_version>");
                }

                // Preview migration (in-memory only) to surface concrete schema rewrites.
                auto mig = studio_core::migrate_gxp_to_latest(parsed.doc);
                if (!mig.ok) {
                    warnings.emplace_back("Migration preview failed: " + mig.error);
                } else {
                    for (const auto& w : mig.warnings) {
                        warnings.push_back("Migration: " + w);
                    }
                    for (const auto& c : mig.changes) {
                        warnings.push_back("Migration change: " + c);
                    }
                }
            }
        }
    }

    const bool ok = errors.empty();

    if (json) {
        emit_json(ok, errors, warnings);
    } else {
        for (const auto& e : errors) {
            std::cerr << e << "\n";
        }
        for (const auto& w : warnings) {
            std::cerr << "Warning: " << w << "\n";
        }
    }

    return ok ? 0 : 1;
}

} // namespace

int main(int argc, char** argv) {
    std::vector<std::string> args;
    args.reserve(static_cast<size_t>(argc));
    for (int i = 1; i < argc; i++) {
        args.emplace_back(argv[i]);
    }

    if (args.empty() || args[0] == "help" || args[0] == "--help" || args[0] == "-h") {
        print_usage(std::cout);
        return 0;
    }

    if (args[0] == "--version" || args[0] == "version") {
        std::cout << kVersion << "\n";
        return 0;
    }

    const auto command = args[0];
    const std::vector<std::string> rest(args.begin() + 1, args.end());

    if (command == "summary") {
        return cmd_summary(rest);
    }

    if (command == "validate") {
        return cmd_validate(rest);
    }

    if (command == "migrate") {
        return cmd_migrate(rest);
    }

    if (command == "export-resource-xml") {
        return cmd_export_resource_xml(rest);
    }

    if (command == "generate") {
        return cmd_generate(rest);
    }

    std::cerr << "Unknown command: " << command << "\n\n";
    print_usage(std::cerr);
    return 2;
}
