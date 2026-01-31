#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr const char* kVersion = "0.1.0";

struct ProjectHeader {
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;
    std::optional<std::string> project_name;
};

constexpr int kMinimumResourceXmlVersion = 56; // PROJECT_VERSION_INITIAL_RESOURCE_XML

std::string read_file_to_string(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error("Unable to open file: " + path);
    }
    std::ostringstream out;
    out << in.rdbuf();
    return out.str();
}

std::optional<std::string> extract_xml_tag_value(const std::string& xml, const std::string& tag) {
    const std::string open = "<" + tag + ">";
    const std::string close = "</" + tag + ">";

    const auto open_pos = xml.find(open);
    if (open_pos == std::string::npos) {
        return std::nullopt;
    }

    const auto start = open_pos + open.size();
    const auto close_pos = xml.find(close, start);
    if (close_pos == std::string::npos) {
        return std::nullopt;
    }

    return xml.substr(start, close_pos - start);
}

ProjectHeader parse_project_header_best_effort(const std::string& xml) {
    ProjectHeader header;

    // Best-effort extraction for Phase 1 scaffolding.
    // For full fidelity/migrations we will switch to a real XML parser.
    header.project_version = extract_xml_tag_value(xml, "project_version");
    header.guix_version = extract_xml_tag_value(xml, "guix_version");
    header.studio_version = extract_xml_tag_value(xml, "studio_version");
    header.project_name = extract_xml_tag_value(xml, "project_name");

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

std::filesystem::path default_output_dir_for_project(const std::filesystem::path& project_path) {
    auto parent = project_path.parent_path();
    if (parent.empty()) {
        return std::filesystem::current_path();
    }
    return parent;
}

int cmd_export_resource_xml(const std::vector<std::string>& args) {
    const auto project = arg_value(args, "--project");
    if (!project) {
        std::cerr << "Missing required flag: --project\n";
        return 2;
    }

    const auto output_path_arg = arg_value(args, "--output_path");
    const bool json = has_flag(args, "--json");

    std::string xml;
    try {
        xml = read_file_to_string(*project);
    } catch (const std::exception& ex) {
        std::cerr << ex.what() << "\n";
        return 2;
    }

    const auto header = parse_project_header_best_effort(xml);
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

    std::ofstream out(out_file, std::ios::binary);
    if (!out) {
        std::cerr << "Unable to open output file: " << out_file.string() << "\n";
        return 2;
    }

    // Minimal resource-project XML; mirrors the legacy doc type/name and key header fields.
    // NOTE: Resource-XML <version> must be >= PROJECT_VERSION_INITIAL_RESOURCE_XML (56).
    const auto project_version_int = parse_int(header.project_version).value_or(0);
    const int resource_xml_version = std::max(kMinimumResourceXmlVersion, project_version_int);

    out << "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";
    out << "<!DOCTYPE GUIX_Studio_Resource>\n";
    out << "<resource_project>\n";

    out << "  <header>\n";
    // In legacy Studio, <name> is the user-chosen base filename (without extension).
    out << "    <name>" << header.project_name.value() << "</name>\n";
    out << "    <version>" << resource_xml_version << "</version>\n";
    out << "    <converter>GUIX Studio</converter>\n";
    if (header.studio_version) {
        out << "    <studio_version>" << header.studio_version.value() << "</studio_version>\n";
    }
    if (header.guix_version) {
        out << "    <guix_version>" << header.guix_version.value() << "</guix_version>\n";
    }
    // These exist in legacy output; Phase 1 doesn't parse them from .gxp yet.
    out << "    <target_cpu></target_cpu>\n";
    out << "    <target_tools></target_tools>\n";
    out << "    <dave2d_graph_accelerator>false</dave2d_graph_accelerator>\n";
    out << "  </header>\n";

    // Legacy output includes display_info (needed by the binary resource pipeline).
    out << "  <display_info>\n";
    out << "    <display_color_format></display_color_format>\n";
    out << "    <rotation_angle></rotation_angle>\n";
    out << "  </display_info>\n";

    out << "</resource_project>\n";

    if (json) {
        std::cout << "{\"ok\":true,\"resource_xml\":\"" << json_escape(out_file.string()) << "\"}\n";
        return 0;
    }

    std::cout << "Wrote resource project XML: " << out_file.string() << "\n";
    return 0;
}

int cmd_generate(const std::vector<std::string>& args) {
    // Phase 1: generate only exports resource-project XML.
    // Future: add resource/spec/bin/srec outputs compatible with legacy Studio.
    return cmd_export_resource_xml(args);
}

int cmd_summary(const std::vector<std::string>& args) {
    const auto project = arg_value(args, "--project");
    if (!project) {
        std::cerr << "Missing required flag: --project\n";
        return 2;
    }

    std::string xml;
    try {
        xml = read_file_to_string(*project);
    } catch (const std::exception& ex) {
        std::cerr << ex.what() << "\n";
        return 2;
    }

    const auto header = parse_project_header_best_effort(xml);
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
    const auto project = arg_value(args, "--project");
    if (!project) {
        std::cerr << "Missing required flag: --project\n";
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

    std::string xml;
    try {
        xml = read_file_to_string(*project);
    } catch (const std::exception& ex) {
        if (json) {
            emit_json(false, {ex.what()}, {});
            return 2;
        }
        std::cerr << ex.what() << "\n";
        return 2;
    }

    // Very small validation for Phase 1.
    // Later: real XML parse + schema version checks + migration path.
    std::vector<std::string> errors;
    std::vector<std::string> warnings;

    if (xml.find("<!DOCTYPE GUIX_Studio_Project") == std::string::npos) {
        errors.emplace_back("Not a GUIX_Studio_Project (.gxp) file (missing doctype)");
    }

    const auto header = parse_project_header_best_effort(xml);
    if (!header.project_name || header.project_name->empty()) {
        errors.emplace_back("Missing <project_name>");
    }

    if (!header.project_version || header.project_version->empty()) {
        errors.emplace_back("Missing <project_version>");
    } else if (!parse_int(header.project_version)) {
        warnings.emplace_back("Non-integer <project_version>");
    }

    if (header.guix_version && !header.guix_version->empty() && !parse_int(header.guix_version)) {
        warnings.emplace_back("Non-integer <guix_version>");
    }

    if (header.studio_version && !header.studio_version->empty() && !parse_int(header.studio_version)) {
        warnings.emplace_back("Non-integer <studio_version>");
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
