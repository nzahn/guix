#include <cstdlib>
#include <cctype>
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
#include "studio_core/strings_csv.h"
#include "studio_core/strings_xliff.h"
#include "studio_core/xml_dom.h"
#include "studio_core/xml_writer.h"

namespace {

std::optional<std::string> arg_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags);
bool has_flag_any(const std::vector<std::string>& args, const std::vector<std::string>& flags);

constexpr const char* kVersion = "0.1.0";

struct ProjectHeader {
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;
    std::optional<std::string> project_name;
};

constexpr int kMinimumResourceXmlVersion = 56; // PROJECT_VERSION_INITIAL_RESOURCE_XML

std::string trim_copy(std::string s) {
    const auto is_space = [](unsigned char c) { return std::isspace(c) != 0; };
    while (!s.empty() && is_space(static_cast<unsigned char>(s.front()))) s.erase(s.begin());
    while (!s.empty() && is_space(static_cast<unsigned char>(s.back()))) s.pop_back();
    return s;
}

std::vector<std::string> split_csv_list(const std::optional<std::string>& s) {
    std::vector<std::string> out;
    if (!s || s->empty()) return out;

    std::string cur;
    for (char c : *s) {
        if (c == ',') {
            auto t = trim_copy(cur);
            if (!t.empty()) out.push_back(t);
            cur.clear();
        } else {
            cur.push_back(c);
        }
    }
    auto t = trim_copy(cur);
    if (!t.empty()) out.push_back(t);

    return out;
}

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

    os << "  guix_studio_cli export-resource-xml --project <path.gxp> [--output_path <dir>] [--display/-d <name>] [--theme/-t <name,name,...>] [--json]\n";
    os << "  guix_studio_cli generate --project <path.gxp> [--output_path <dir>] [--resource/-r [base]] [--specification/-s [base]] [--binary/-b]";
    os << " [--display/-d <name>] [--theme/-t <name,name,...>] [--language/-l <name,name,...>] [--json]\n";
    os << "  guix_studio_cli generate --xml/-x <path.resource.xml> [--output_path <dir>] [--binary/-b] [--big_endian] [--no_res_header] [--json]\n\n";

    os << "  guix_studio_cli export-strings --project <path.gxp> --output <path.csv> --src <lang> [--target <lang> | --targets <lang,lang,...>] [--json]\n";
    os << "  guix_studio_cli import-strings --project <path.gxp> --input <path.csv> [--output <path.gxp> | --in-place] [--json]\n\n";

    os << "  guix_studio_cli export-xliff --project <path.gxp> --output <path.xlf> --src <lang> --target <lang> [--version 1|2] [--json]\n";
    os << "  guix_studio_cli import-xliff --project <path.gxp> --input <path.xlf> [--output <path.gxp> | --in-place] [--json]\n\n";
    os << "Notes:\n";
    os << "  - This is NOT a full replacement for the legacy Studio generator yet.\n";
    os << "  - Phase 1 generation currently exports a minimal resource-project XML only.\n";
    os << "  - Future phases will implement Studio-compatible C/spec/bin/srec outputs.\n";
}

int cmd_export_xliff(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output = arg_value_any(args, {"--output"});
    if (!output) {
        std::cerr << "Missing required flag: --output\n";
        return 2;
    }

    const auto src = arg_value_any(args, {"--src"});
    if (!src) {
        std::cerr << "Missing required flag: --src\n";
        return 2;
    }

    const auto target = arg_value_any(args, {"--target"});
    if (!target) {
        std::cerr << "Missing required flag: --target\n";
        return 2;
    }

    const auto version = parse_int(arg_value_any(args, {"--version"})).value_or(2);
    const bool json = has_flag_any(args, {"--json"});

    const auto res = studio_core::export_strings_xliff_from_gxp(*project, *output, *src, *target, version);
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(*output) << "\"";
        std::cout << ",\"units\":" << res.unit_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote XLIFF: " << *output << "\n";
    return 0;
}

int cmd_import_xliff(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto input = arg_value_any(args, {"--input", "-i"});
    if (!input) {
        std::cerr << "Missing required flag: --input/-i\n";
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
        out_path.replace_filename(in_path.stem().string() + ".xliff_imported" + in_path.extension().string());
    }

    const auto res = studio_core::import_strings_xliff_to_gxp(*project, *input, out_path.string());
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"input\":\"" << json_escape(*input) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";
        std::cout << ",\"updated_records\":" << res.updated_records;
        std::cout << ",\"added_records\":" << res.added_records;
        std::cout << ",\"added_languages\":" << res.added_languages;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote updated project: " << out_path.string() << "\n";
    return 0;
}

int cmd_export_strings(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output = arg_value_any(args, {"--output"});
    if (!output) {
        std::cerr << "Missing required flag: --output\n";
        return 2;
    }

    const auto src = arg_value_any(args, {"--src"});
    if (!src) {
        std::cerr << "Missing required flag: --src\n";
        return 2;
    }

    std::vector<std::string> targets;
    if (const auto target = arg_value_any(args, {"--target"})) {
        targets.push_back(*target);
    }
    if (const auto targets_csv = arg_value_any(args, {"--targets"})) {
        for (const auto& s : split_csv_list(targets_csv)) {
            if (!s.empty()) targets.push_back(s);
        }
    }

    if (targets.empty()) {
        std::cerr << "Missing required flag: --target or --targets\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const auto res = studio_core::export_strings_csv_from_gxp(*project, *output, *src, targets);
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(*output) << "\"";
        std::cout << ",\"src\":\"" << json_escape(*src) << "\"";
        std::cout << ",\"targets\":[";
        for (size_t i = 0; i < targets.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(targets[i]) << "\"";
        }
        std::cout << "]";
        std::cout << ",\"records\":" << res.record_count;
        std::cout << ",\"languages\":" << res.language_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote strings CSV: " << *output << "\n";
    return 0;
}

int cmd_import_strings(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto input = arg_value_any(args, {"--input", "-i"});
    if (!input) {
        std::cerr << "Missing required flag: --input/-i\n";
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
        out_path.replace_filename(in_path.stem().string() + ".strings_imported" + in_path.extension().string());
    }

    const auto res = studio_core::import_strings_csv_to_gxp(*project, *input, out_path.string());
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"input\":\"" << json_escape(*input) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";
        std::cout << ",\"updated_records\":" << res.updated_records;
        std::cout << ",\"added_records\":" << res.added_records;
        std::cout << ",\"added_languages\":" << res.added_languages;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote updated project: " << out_path.string() << "\n";
    return 0;
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

struct FlagOptArg {
    bool present = false;
    std::optional<std::string> value;
};

// Returns whether a flag is present, and an optional value if the next token is not another flag.
// This matches legacy Studio behavior where `-r -s` is valid and implies default filenames.
FlagOptArg flag_optional_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        for (size_t i = 0; i < args.size(); i++) {
            if (args[i] != f) continue;

            FlagOptArg r;
            r.present = true;
            if (i + 1 < args.size()) {
                const auto& next = args[i + 1];
                if (!next.empty() && next[0] != '-') {
                    r.value = next;
                }
            }
            return r;
        }
    }
    return {};
}

static bool has_extension(const std::filesystem::path& p) {
    return p.has_extension() && !p.extension().string().empty();
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
    const auto display_arg = arg_value_any(args, {"--display", "-d"});
    const auto theme_arg = arg_value_any(args, {"--theme", "-t"});
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

    studio_core::ResourceXmlExportOptions opts;
    if (display_arg && !display_arg->empty()) {
        opts.display_name = *display_arg;
    }
    if (theme_arg && !theme_arg->empty()) {
        opts.theme_names = split_csv_list(theme_arg);
    }

    const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string(), opts);
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

    const auto resource_flag = flag_optional_value_any(args, {"--resource", "-r"});
    const auto spec_flag = flag_optional_value_any(args, {"--specification", "-s"});

    const bool gen_resource = resource_flag.present;
    const bool gen_specification = spec_flag.present;
    const bool binary = has_flag_any(args, {"--binary", "-b"});
    const bool big_endian = has_flag_any(args, {"--big_endian"});
    const bool no_res_header = has_flag_any(args, {"--no_res_header"});

    const auto display_arg = arg_value_any(args, {"--display", "-d"});
    const auto theme_arg = arg_value_any(args, {"--theme", "-t"});
    const auto language_arg = arg_value_any(args, {"--language", "-l"});

    const auto display_filters = split_csv_list(display_arg);
    const auto theme_filters = split_csv_list(theme_arg);
    const auto language_filters = split_csv_list(language_arg);

    std::vector<std::string> warnings;

    if (!project && !xml_in) {
        std::cerr << "Missing required flag: --project/-p or --xml/-x\n";
        return 2;
    }

    if (xml_in && (!display_filters.empty() || !theme_filters.empty() || !language_filters.empty())) {
        warnings.push_back("--display/--theme/--language are ignored when using --xml input");
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
    const bool any_requested = (gen_resource || gen_specification || binary);

    // Validate selection filters (best-effort, only when a .gxp is provided).
    std::optional<std::string> selected_display_name;
    std::vector<std::string> selected_theme_names;
    std::vector<std::string> selected_language_names;
    if (project) {
        auto parsed = studio_core::parse_xml_file(*project);
        if (!parsed.ok) {
            std::cerr << parsed.error << "\n";
            return 1;
        }
        {
            auto mig = studio_core::migrate_gxp_to_latest(parsed.doc);
            if (!mig.ok) {
                warnings.push_back("Migration failed: " + mig.error);
            } else {
                for (const auto& w : mig.warnings) warnings.push_back(w);
            }
        }

        // Collect known languages.
        std::vector<std::string> known_languages;
        if (const auto* header = parsed.doc.root.firstChild("header")) {
            if (const auto* ln = header->firstChild("language_names")) {
                for (const auto& c : ln->children) {
                    if (c.name == "language" && !c.text.empty()) {
                        known_languages.push_back(c.text);
                    }
                }
            }
        }

        // Validate language filters.
        if (!language_filters.empty()) {
            for (const auto& l : language_filters) {
                bool found = false;
                for (const auto& k : known_languages) {
                    if (k == l) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    std::cerr << "Unknown language: " << l << "\n";
                    return 2;
                }
            }
            selected_language_names = language_filters;
        }

        // Collect displays and pick selected display.
        std::vector<std::string> known_displays;
        const studio_core::XmlNode* selected_display = nullptr;
        for (const auto* d : parsed.doc.root.childrenNamed("display_info")) {
            const auto dn = studio_core::node_text(*d, "display_name");
            if (dn && !dn->empty()) {
                known_displays.push_back(*dn);
            }
        }

        if (!display_filters.empty()) {
            // Phase 1: only one display is materialized in resource XML; use first.
            if (display_filters.size() > 1) {
                warnings.push_back("Phase 1: only one display is supported; using the first entry from --display");
            }
            selected_display_name = display_filters.front();

            for (const auto* d : parsed.doc.root.childrenNamed("display_info")) {
                const auto dn = studio_core::node_text(*d, "display_name");
                if (dn && *dn == *selected_display_name) {
                    selected_display = d;
                    break;
                }
            }
            if (!selected_display) {
                std::cerr << "Unknown display: " << *selected_display_name << "\n";
                return 2;
            }
        } else {
            // Default to display_index==0 like export_resource_xml.
            for (const auto* d : parsed.doc.root.childrenNamed("display_info")) {
                const auto idx = studio_core::node_int(*d, "display_index");
                if (idx && *idx == 0) {
                    selected_display = d;
                    const auto dn = studio_core::node_text(*d, "display_name");
                    if (dn && !dn->empty()) selected_display_name = *dn;
                    break;
                }
            }
            if (!selected_display) {
                selected_display = parsed.doc.root.firstChild("display_info");
                if (selected_display) {
                    const auto dn = studio_core::node_text(*selected_display, "display_name");
                    if (dn && !dn->empty()) selected_display_name = *dn;
                }
            }
        }

        // Validate themes within selected display.
        if (selected_display && !theme_filters.empty()) {
            std::vector<std::string> known_themes;
            if (const auto* ti = selected_display->firstChild("theme_info")) {
                for (const auto& c : ti->children) {
                    if (c.name == "theme_name" && !c.text.empty()) {
                        known_themes.push_back(c.text);
                    }
                }
            }

            for (const auto& t : theme_filters) {
                bool found = false;
                for (const auto& k : known_themes) {
                    if (k == t) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    std::cerr << "Unknown theme: " << t << "\n";
                    return 2;
                }
            }
            selected_theme_names = theme_filters;
        }
    }

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
            studio_core::ResourceXmlExportOptions opts;
            if (selected_display_name) opts.display_name = *selected_display_name;
            opts.theme_names = selected_theme_names;

            const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string(), opts);
            if (!exported.ok) {
                std::cerr << exported.error << "\n";
                return 1;
            }
            for (const auto& w : exported.warnings) {
                warnings.push_back(w);
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

    // Resource/spec outputs are legacy flags with optional base names.
    if (gen_resource) {
        const std::string base = resource_flag.value.value_or(*project_name + "_resources");
        std::filesystem::path p(base);
        if (p.is_relative()) {
            p = out_dir / p;
        }

        if (has_extension(p)) {
            outputs.push_back({"resource", p});
        } else {
            outputs.push_back({"resource_c", std::filesystem::path(p.string() + ".c")});
            outputs.push_back({"resource_h", std::filesystem::path(p.string() + ".h")});
        }
    } else if (!any_requested) {
        // If user didn't request anything, keep Phase 1 behavior (resource XML only).
    }

    if (gen_specification) {
        const std::string base = spec_flag.value.value_or(*project_name + "_specifications");
        std::filesystem::path p(base);
        if (p.is_relative()) {
            p = out_dir / p;
        }

        if (has_extension(p)) {
            outputs.push_back({"specification", p});
        } else {
            outputs.push_back({"specification_c", std::filesystem::path(p.string() + ".c")});
            outputs.push_back({"specification_h", std::filesystem::path(p.string() + ".h")});
        }
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

        if (o.kind == "resource" || o.kind == "resource_c" || o.kind == "resource_h") {
            f << "/* Phase 1 stub: resource C output not implemented yet. */\n";
            f << "/* Project: " << *project_name << " */\n";
            f << "/* Generated from: " << (project ? *project : resource_xml_path.string()) << " */\n";
        } else if (o.kind == "specification" || o.kind == "specification_c" || o.kind == "specification_h") {
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

        std::cout << ",\"filters\":{";
        auto emit_list = [&](const char* key, const std::vector<std::string>& vals) {
            std::cout << "\"" << key << "\":[";
            for (size_t i = 0; i < vals.size(); ++i) {
                if (i) std::cout << ",";
                std::cout << "\"" << json_escape(vals[i]) << "\"";
            }
            std::cout << "]";
        };
        emit_list("display", display_filters);
        std::cout << ",";
        emit_list("theme", theme_filters);
        std::cout << ",";
        emit_list("language", language_filters);
        std::cout << "}";

        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(warnings[i]) << "\"";
        }
        std::cout << "]";

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

    if (command == "export-strings") {
        return cmd_export_strings(rest);
    }

    if (command == "import-strings") {
        return cmd_import_strings(rest);
    }

    if (command == "export-xliff") {
        return cmd_export_xliff(rest);
    }

    if (command == "import-xliff") {
        return cmd_import_xliff(rest);
    }

    std::cerr << "Unknown command: " << command << "\n\n";
    print_usage(std::cerr);
    return 2;
}
