#include "studio_core/strings_csv.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "studio_core/language_registry.h"
#include "studio_core/xml_dom.h"

namespace studio_core {

namespace {

static std::string trim_copy(std::string s) {
    const auto is_space = [](unsigned char c) { return std::isspace(c) != 0; };
    while (!s.empty() && is_space(static_cast<unsigned char>(s.front()))) s.erase(s.begin());
    while (!s.empty() && is_space(static_cast<unsigned char>(s.back()))) s.pop_back();
    return s;
}

struct CsvTable {
    std::vector<std::string> header;
    std::vector<std::vector<std::string>> rows;
};

static bool parse_csv_line(const std::string& line, std::vector<std::string>& out_fields, std::string* err) {
    out_fields.clear();
    std::string field;
    bool in_quotes = false;

    for (size_t i = 0; i < line.size(); ++i) {
        const char c = line[i];
        if (in_quotes) {
            if (c == '"') {
                if (i + 1 < line.size() && line[i + 1] == '"') {
                    field.push_back('"');
                    ++i;
                } else {
                    in_quotes = false;
                }
            } else {
                field.push_back(c);
            }
        } else {
            if (c == ',') {
                out_fields.push_back(field);
                field.clear();
            } else if (c == '"') {
                in_quotes = true;
            } else {
                field.push_back(c);
            }
        }
    }

    if (in_quotes) {
        if (err) *err = "Unterminated quote in CSV";
        return false;
    }

    out_fields.push_back(field);
    return true;
}

static std::string csv_escape_field(const std::string& s) {
    bool needs_quotes = false;
    for (char c : s) {
        if (c == ',' || c == '"' || c == '\n' || c == '\r') {
            needs_quotes = true;
            break;
        }
    }
    if (!needs_quotes) return s;

    std::string out;
    out.reserve(s.size() + 2);
    out.push_back('"');
    for (char c : s) {
        if (c == '"') out.push_back('"');
        out.push_back(c);
    }
    out.push_back('"');
    return out;
}

static bool read_csv_file(const std::string& path, CsvTable& out, std::string* err) {
    std::ifstream f(path);
    if (!f) {
        if (err) *err = "Unable to open CSV: " + path;
        return false;
    }

    std::string line;
    std::vector<std::string> fields;

    bool got_header = false;
    while (std::getline(f, line)) {
        // Trim CR for Windows line endings.
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (!got_header) {
            // Strip UTF-8 BOM if present.
            if (line.size() >= 3 && static_cast<unsigned char>(line[0]) == 0xEF &&
                static_cast<unsigned char>(line[1]) == 0xBB && static_cast<unsigned char>(line[2]) == 0xBF) {
                line.erase(0, 3);
            }
            std::string parse_err;
            if (!parse_csv_line(line, fields, &parse_err)) {
                if (err) *err = parse_err;
                return false;
            }
            out.header.clear();
            for (auto& h : fields) {
                out.header.push_back(trim_copy(h));
            }
            got_header = true;
            continue;
        }

        // Skip empty lines.
        if (trim_copy(line).empty()) continue;

        std::string parse_err;
        if (!parse_csv_line(line, fields, &parse_err)) {
            if (err) *err = parse_err;
            return false;
        }
        out.rows.push_back(fields);
    }

    if (!got_header) {
        if (err) *err = "CSV is empty";
        return false;
    }
    return true;
}

static std::vector<std::string> extract_language_names(const XmlDocument& doc) {
    std::vector<std::string> langs;
    const auto* header = doc.root.firstChild("header");
    if (!header) return langs;
    const auto* ln = header->firstChild("language_names");
    if (!ln) return langs;

    for (const auto& c : ln->children) {
        if (c.name == "language" && !c.text.empty()) {
            langs.push_back(c.text);
        }
    }
    return langs;
}

static std::optional<int> project_language_column(const std::vector<std::string>& langs, const std::string& language_name) {
    for (size_t i = 0; i < langs.size(); ++i) {
        if (langs[i] == language_name) return static_cast<int>(i);
    }
    return std::nullopt;
}

static std::optional<std::string> normalize_language_name_for_project(const std::vector<std::string>& project_langs,
                                                                      const std::string& input) {
    // Accept exact language name.
    if (project_language_column(project_langs, input)) return input;

    // Accept language id.
    if (auto name = language_name_for_id(input)) {
        if (project_language_column(project_langs, *name)) return *name;
    }

    // Accept known language name even if not in project (useful for targets).
    if (language_index_for_name(input)) return input;

    // Accept known language id even if not in project (useful for targets).
    if (auto name = language_name_for_id(input)) return *name;

    return std::nullopt;
}

static const XmlNode* select_display_const(const XmlNode& root) {
    const XmlNode* selected = nullptr;
    for (const auto* d : root.childrenNamed("display_info")) {
        const auto idx = node_int(*d, "display_index").value_or(0);
        if (idx == 0) {
            selected = d;
            break;
        }
    }
    if (!selected) {
        selected = root.firstChild("display_info");
    }
    return selected;
}

static XmlNode* select_display(XmlNode& root) {
    XmlNode* selected = nullptr;
    for (auto* d : root.childrenNamed("display_info")) {
        const auto idx = node_int(*d, "display_index").value_or(0);
        if (idx == 0) {
            selected = d;
            break;
        }
    }
    if (!selected) {
        selected = root.firstChild("display_info");
    }
    return selected;
}

static XmlNode* find_or_create_string_table(XmlNode& display_info) {
    if (auto* st = display_info.firstChild("string_table")) return st;
    display_info.children.push_back(XmlNode{"string_table", "", {}, {}});
    return &display_info.children.back();
}

static XmlNode* find_or_create_child(XmlNode& parent, const std::string& name) {
    if (auto* c = parent.firstChild(name.c_str())) return c;
    parent.children.push_back(XmlNode{name, "", {}, {}});
    return &parent.children.back();
}

static std::optional<std::string> child_text(const XmlNode& parent, const char* name) {
    if (const auto* c = parent.firstChild(name)) {
        return c->text;
    }
    return std::nullopt;
}

static XmlNode* find_string_record_by_id(XmlNode& string_table, const std::string& id) {
    for (auto& c : string_table.children) {
        if (c.name != "string_record") continue;
        const auto rid = child_text(c, "id");
        if (rid && *rid == id) return &c;
    }
    return nullptr;
}

static void set_or_add_child_text(XmlNode& parent, const std::string& name, const std::string& value) {
    for (auto& c : parent.children) {
        if (c.name == name) {
            c.text = value;
            return;
        }
    }
    parent.children.push_back(XmlNode{name, value, {}, {}});
}

static void set_val_children(XmlNode& record, const std::vector<std::string>& vals) {
    // Remove existing <val> children.
    std::vector<XmlNode> kept;
    kept.reserve(record.children.size());
    for (auto& c : record.children) {
        if (c.name != "val") kept.push_back(std::move(c));
    }
    record.children = std::move(kept);

    // Append new vals.
    for (const auto& v : vals) {
        record.children.push_back(XmlNode{"val", v, {}, {}});
    }
}

static void update_num_strings(XmlNode& string_table) {
    int count = 0;
    for (const auto& c : string_table.children) {
        if (c.name == "string_record") count++;
    }
    set_or_add_child_text(string_table, "num_strings", std::to_string(count));
}

static void ensure_num_languages(XmlNode& string_table, int n) {
    set_or_add_child_text(string_table, "num_languages", std::to_string(n));
}

static void ensure_display_language_flag(XmlNode& display_info, const std::string& language_name) {
    for (const auto& c : display_info.children) {
        if (c.name == language_name) return;
    }
    display_info.children.push_back(XmlNode{language_name, "TRUE", {}, {}});
}

static void append_language_to_header(XmlDocument& doc, const std::string& language_name) {
    auto* header = doc.root.firstChild("header");
    if (!header) {
        doc.root.children.push_back(XmlNode{"header", "", {}, {}});
        header = &doc.root.children.back();
    }

    // Update <num_languages>
    auto* num_lang = header->firstChild("num_languages");
    int current = 0;
    if (num_lang) {
        try {
            current = std::stoi(num_lang->text);
        } catch (...) {
            current = 0;
        }
    }
    set_or_add_child_text(*header, "num_languages", std::to_string(current + 1));

    // Append to <language_names> (flat struct layout).
    auto* ln = find_or_create_child(*header, "language_names");
    ln->children.push_back(XmlNode{"language", language_name, {}, {}});
    ln->children.push_back(XmlNode{"support_bidi_text", "FALSE", {}, {}});
    ln->children.push_back(XmlNode{"gen_reordered_bidi_text", "FALSE", {}, {}});
    ln->children.push_back(XmlNode{"support_thai_glyph_shaping", "FALSE", {}, {}});
    ln->children.push_back(XmlNode{"gen_adjusted_thai_string", "FALSE", {}, {}});
    ln->children.push_back(XmlNode{"statically_defined", "TRUE", {}, {}});
}

static int ensure_language_exists_in_project(XmlDocument& gxp_doc,
                                            const std::string& language_name,
                                            int* out_added_languages) {
    auto langs = extract_language_names(gxp_doc);
    if (auto col = project_language_column(langs, language_name)) {
        return *col;
    }

    append_language_to_header(gxp_doc, language_name);
    if (out_added_languages) (*out_added_languages)++;

    auto updated_langs = extract_language_names(gxp_doc);
    const int new_lang_count = static_cast<int>(updated_langs.size());

    for (auto* display : gxp_doc.root.childrenNamed("display_info")) {
        ensure_display_language_flag(*display, language_name);
        auto* st = display->firstChild("string_table");
        if (!st) continue;

        for (auto& rec : st->children) {
            if (rec.name != "string_record") continue;
            std::vector<std::string> vals;
            for (const auto& c : rec.children) {
                if (c.name == "val") vals.push_back(c.text);
            }
            if (static_cast<int>(vals.size()) < new_lang_count) {
                vals.resize(new_lang_count);
                set_val_children(rec, vals);
            }
        }

        ensure_num_languages(*st, new_lang_count);
        update_num_strings(*st);
    }

    return new_lang_count - 1;
}

} // namespace

StringsExportCsvResult export_strings_csv_from_gxp(const std::string& gxp_path,
                                                  const std::string& out_csv_path,
                                                  const std::string& src_language,
                                                  const std::vector<std::string>& target_languages) {
    StringsExportCsvResult r;

    auto parsed = parse_xml_file(gxp_path);
    if (!parsed.ok) {
        r.error = parsed.error;
        return r;
    }

    const auto languages = extract_language_names(parsed.doc);
    if (languages.empty()) {
        r.error = "Missing <language_names>";
        return r;
    }

    const auto src_name = normalize_language_name_for_project(languages, src_language);
    if (!src_name) {
        r.error = "Unknown/unsupported source language: " + src_language;
        return r;
    }
    const auto src_col = project_language_column(languages, *src_name);
    if (!src_col) {
        r.error = "Source language not present in project: " + *src_name;
        return r;
    }

    std::vector<std::string> target_names;
    target_names.reserve(target_languages.size());
    for (const auto& t : target_languages) {
        const auto tn = normalize_language_name_for_project(languages, t);
        if (!tn) {
            r.error = "Unknown/unsupported target language: " + t;
            return r;
        }
        target_names.push_back(*tn);
    }

    const auto* display = select_display_const(parsed.doc.root);
    if (!display) {
        r.error = "Missing <display_info>";
        return r;
    }

    const auto* st = display->firstChild("string_table");
    if (!st) {
        r.error = "Missing <string_table>";
        return r;
    }

    {
        std::error_code ec;
        const auto parent = std::filesystem::path(out_csv_path).parent_path();
        if (!parent.empty()) {
            std::filesystem::create_directories(parent, ec);
            if (ec) {
                r.error = "Failed to create output directory: " + parent.string();
                return r;
            }
        }
    }

    std::ofstream out(out_csv_path, std::ios::binary);
    if (!out) {
        r.error = "Unable to open output CSV: " + out_csv_path;
        return r;
    }

    // Write UTF-8 BOM for better compatibility with spreadsheet tools.
    out.write("\xEF\xBB\xBF", 3);

    auto src_id = language_id_for_name(*src_name);
    if (!src_id) {
        r.error = "Unsupported language (no id mapping): " + *src_name;
        return r;
    }

    std::vector<std::string> target_ids;
    target_ids.reserve(target_names.size());
    for (const auto& tn : target_names) {
        auto tid = language_id_for_name(tn);
        if (!tid) {
            r.error = "Unsupported language (no id mapping): " + tn;
            return r;
        }
        target_ids.push_back(*tid);
    }

    // Legacy GUIX Studio CSV header: name,<srcLangId>,<targetLangId...>
    out << "name," << csv_escape_field(*src_id);
    for (const auto& tid : target_ids) {
        out << "," << csv_escape_field(tid);
    }
    out << "\n";

    const int src_col_int = *src_col;
    std::vector<std::optional<int>> target_cols;
    target_cols.reserve(target_names.size());
    for (const auto& tn : target_names) {
        target_cols.push_back(project_language_column(languages, tn));
    }

    int record_count = 0;
    for (const auto& c : st->children) {
        if (c.name != "string_record") continue;
        const auto id = child_text(c, "id").value_or(std::string{});
        if (id.empty()) continue;

        std::vector<std::string> vals;
        for (const auto& cc : c.children) {
            if (cc.name == "val") vals.push_back(cc.text);
        }

        // Normalize val count to language count.
        if (static_cast<int>(vals.size()) < static_cast<int>(languages.size())) {
            vals.resize(languages.size());
        } else if (static_cast<int>(vals.size()) > static_cast<int>(languages.size())) {
            vals.resize(languages.size());
        }

        const std::string src_val = (src_col_int >= 0 && src_col_int < static_cast<int>(vals.size())) ? vals[src_col_int]
                                                                                                      : std::string{};
        if (trim_copy(src_val).empty()) {
            // Legacy Studio only exports rows with a non-empty source string.
            continue;
        }

        out << csv_escape_field(id) << "," << csv_escape_field(src_val);
        for (const auto& tc : target_cols) {
            if (tc && *tc >= 0 && *tc < static_cast<int>(vals.size())) {
                out << "," << csv_escape_field(vals[*tc]);
            } else {
                out << ",";
            }
        }
        out << "\n";
        record_count++;
    }

    r.ok = true;
    r.record_count = record_count;
    r.language_count = 1 + static_cast<int>(target_languages.size());
    return r;
}

StringsImportCsvResult import_strings_csv_to_gxp(const std::string& gxp_path,
                                                const std::string& csv_path,
                                                const std::string& out_gxp_path) {
    StringsImportCsvResult r;

    auto parsed = parse_xml_file(gxp_path);
    if (!parsed.ok) {
        r.error = parsed.error;
        return r;
    }

    const auto project_languages = extract_language_names(parsed.doc);
    if (project_languages.empty()) {
        r.error = "Missing <language_names>";
        return r;
    }

    CsvTable csv;
    std::string csv_err;
    if (!read_csv_file(csv_path, csv, &csv_err)) {
        r.error = csv_err;
        return r;
    }

    // Legacy GUIX Studio CSV format:
    //   name,<srcLangId>,<targetLangId...>
    if (csv.header.size() < 2) {
        r.error = "CSV header must be: name,<srcLangId>,<targetLangId...>";
        return r;
    }

    const auto name_field = trim_copy(csv.header[0]);
    if (name_field != "name") {
        r.error = "CSV header missing required first column: name";
        return r;
    }

    const auto src_id = trim_copy(csv.header[1]);
    if (src_id.empty()) {
        r.error = "CSV header missing required source language id";
        return r;
    }

    const auto src_name = language_name_for_id(src_id);
    if (!src_name) {
        r.error = "Unknown/unsupported source language id: " + src_id;
        return r;
    }

    auto src_col = project_language_column(project_languages, *src_name);
    if (!src_col) {
        r.error = "Source language not present in project: " + *src_name;
        return r;
    }

    std::vector<std::string> target_names;
    target_names.reserve(csv.header.size() > 2 ? csv.header.size() - 2 : 0);
    for (size_t i = 2; i < csv.header.size(); ++i) {
        const auto tid = trim_copy(csv.header[i]);
        if (tid.empty()) {
            r.warnings.push_back("Empty target language id in CSV header column " + std::to_string(i + 1));
            continue;
        }
        const auto tn = language_name_for_id(tid);
        if (!tn) {
            r.error = "Unknown/unsupported target language id: " + tid;
            return r;
        }
        target_names.push_back(*tn);
    }

    XmlNode& root = parsed.doc.root;
    auto* display = select_display(root);
    if (!display) {
        r.error = "Missing <display_info>";
        return r;
    }

    XmlNode* st = find_or_create_string_table(*display);

    // Ensure any target languages exist before applying row updates (keeps column counts stable).
    int added_langs = 0;
    std::vector<int> target_cols;
    target_cols.reserve(target_names.size());
    for (const auto& tn : target_names) {
        target_cols.push_back(ensure_language_exists_in_project(parsed.doc, tn, &added_langs));
    }

    // Refresh source column after possible language additions.
    const auto project_languages_after = extract_language_names(parsed.doc);
    src_col = project_language_column(project_languages_after, *src_name);
    if (!src_col) {
        r.error = "Internal error: source language missing after language updates";
        return r;
    }

    // Apply row updates.
    int updated = 0;
    int added = 0;

    const int src_col_int = *src_col;

    for (const auto& row : csv.rows) {
        if (row.empty()) continue;
        const auto id = trim_copy(row[0]);
        if (id.empty()) continue;

        const std::string src_val = (row.size() >= 2) ? row[1] : std::string{};

        XmlNode* rec = find_string_record_by_id(*st, id);
        if (!rec) {
            // Add new record.
            st->children.push_back(XmlNode{"string_record", "", {}, {}});
            rec = &st->children.back();
            set_or_add_child_text(*rec, "id", id);
            set_or_add_child_text(*rec, "font", "0");
            added++;
        }

        // Load existing vals so we can patch only relevant columns.
        std::vector<std::string> vals;
        for (const auto& cc : rec->children) {
            if (cc.name == "val") vals.push_back(cc.text);
        }

        // Normalize to current project language count (post-ensure_language...)
        const int project_lang_count = static_cast<int>(project_languages_after.size());
        if (static_cast<int>(vals.size()) < project_lang_count) {
            vals.resize(project_lang_count);
        } else if (static_cast<int>(vals.size()) > project_lang_count) {
            vals.resize(project_lang_count);
        }

        // Patch source and targets.
        if (src_col_int >= 0 && src_col_int < static_cast<int>(vals.size())) {
            vals[src_col_int] = src_val;
        }

        for (size_t ti = 0; ti < target_cols.size(); ++ti) {
            const int tc = target_cols[ti];
            const size_t csv_col = 2 + ti;
            const std::string tval = (csv_col < row.size()) ? row[csv_col] : std::string{};
            if (tc >= 0 && tc < static_cast<int>(vals.size())) {
                vals[tc] = tval;
            }
        }

        set_val_children(*rec, vals);
        updated++;
    }

    ensure_num_languages(*st, static_cast<int>(project_languages_after.size()));
    update_num_strings(*st);

    std::string write_err;
    if (!write_xml_file(out_gxp_path, parsed.doc, &write_err)) {
        r.error = write_err;
        return r;
    }

    r.ok = true;
    r.updated_records = updated;
    r.added_records = added;
    r.added_languages = added_langs;
    return r;
}

} // namespace studio_core
