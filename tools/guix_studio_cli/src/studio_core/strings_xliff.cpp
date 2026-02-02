#include "studio_core/strings_xliff.h"

#include <cctype>
#include <filesystem>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "studio_core/language_registry.h"
#include "studio_core/xml_dom.h"

namespace studio_core {

namespace {

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

static std::vector<std::string> extract_project_language_names(const XmlDocument& doc) {
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

static std::optional<int> project_language_column(const std::vector<std::string>& project_langs, const std::string& lang_name) {
    for (size_t i = 0; i < project_langs.size(); ++i) {
        if (project_langs[i] == lang_name) return static_cast<int>(i);
    }
    return std::nullopt;
}

static std::optional<std::string> normalize_language_to_id(const std::vector<std::string>& project_langs, const std::string& input) {
    // If input matches a project language name, convert it to an id.
    for (const auto& n : project_langs) {
        if (n == input) {
            return language_id_for_name(n);
        }
    }

    // Otherwise treat it as an id (e.g. "en").
    if (language_index_for_id(input)) {
        return std::string(input);
    }

    // Or a language name in the global list.
    if (auto id = language_id_for_name(input)) {
        return id;
    }

    return std::nullopt;
}

static std::optional<std::string> normalize_language_to_name(const std::vector<std::string>& project_langs, const std::string& input) {
    // If it matches a project language name, accept it.
    for (const auto& n : project_langs) {
        if (n == input) return n;
    }

    // If it looks like an id, map to name.
    if (auto name = language_name_for_id(input)) {
        return name;
    }

    // If it's a known global language name, accept.
    if (language_index_for_name(input)) {
        return input;
    }

    return std::nullopt;
}

static std::optional<std::string> attr_value(const XmlNode& node, const char* attr_name) {
    for (const auto& a : node.attrs) {
        if (a.name == attr_name) return a.value;
    }
    return std::nullopt;
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

static XmlNode* find_or_create_child(XmlNode& parent, const std::string& name) {
    if (auto* c = parent.firstChild(name.c_str())) return c;
    parent.children.push_back(XmlNode{name, "", {}, {}});
    return &parent.children.back();
}

static XmlNode* find_string_record_by_id(XmlNode& string_table, const std::string& id) {
    for (auto& c : string_table.children) {
        if (c.name != "string_record") continue;
        if (auto* cid = c.firstChild("id")) {
            if (cid->text == id) return &c;
        }
    }
    return nullptr;
}

static void set_val_children(XmlNode& record, const std::vector<std::string>& vals) {
    std::vector<XmlNode> kept;
    kept.reserve(record.children.size());
    for (auto& c : record.children) {
        if (c.name != "val") kept.push_back(std::move(c));
    }
    record.children = std::move(kept);

    for (const auto& v : vals) {
        record.children.push_back(XmlNode{"val", v, {}, {}});
    }
}

static void ensure_num_languages(XmlNode& string_table, int n) {
    set_or_add_child_text(string_table, "num_languages", std::to_string(n));
}

static void update_num_strings(XmlNode& string_table) {
    int count = 0;
    for (const auto& c : string_table.children) {
        if (c.name == "string_record") count++;
    }
    set_or_add_child_text(string_table, "num_strings", std::to_string(count));
}

static void ensure_display_language_flag(XmlNode& display_info, const std::string& language_name) {
    // In the .gxp schema, enabled languages are represented as <English>TRUE</English> under <display_info>.
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
    auto langs = extract_project_language_names(gxp_doc);
    if (auto col = project_language_column(langs, language_name)) {
        return *col;
    }

    append_language_to_header(gxp_doc, language_name);
    if (out_added_languages) (*out_added_languages)++;

    // Update all displays: add <LanguageName>TRUE</LanguageName> and extend string tables.
    auto updated_langs = extract_project_language_names(gxp_doc);
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

    return new_lang_count - 1; // appended at end
}

static std::optional<std::string> first_text_child(const XmlNode& parent, const char* child_name) {
    if (const auto* c = parent.firstChild(child_name)) {
        return c->text;
    }
    return std::nullopt;
}

} // namespace

StringsExportXliffResult export_strings_xliff_from_gxp(const std::string& gxp_path,
                                                      const std::string& out_xliff_path,
                                                      const std::string& src_language,
                                                      const std::string& target_language,
                                                      int version) {
    StringsExportXliffResult r;

    auto parsed = parse_xml_file(gxp_path);
    if (!parsed.ok) {
        r.error = parsed.error;
        return r;
    }

    const auto project_langs = extract_project_language_names(parsed.doc);
    if (project_langs.empty()) {
        r.error = "Missing <language_names>";
        return r;
    }

    const auto src_name = normalize_language_to_name(project_langs, src_language);
    if (!src_name) {
        r.error = "Unknown source language: " + src_language;
        return r;
    }

    const auto src_id = normalize_language_to_id(project_langs, *src_name);
    if (!src_id) {
        r.error = "Unable to map source language to language id: " + *src_name;
        return r;
    }

    const auto target_name = normalize_language_to_name(project_langs, target_language);
    const auto target_id = normalize_language_to_id(project_langs, target_language);
    if (!target_id) {
        r.error = "Unknown target language: " + target_language;
        return r;
    }

    const auto src_col = project_language_column(project_langs, *src_name);
    if (!src_col) {
        r.error = "The specified source language is not included in this project: " + *src_name;
        return r;
    }

    std::optional<int> target_col;
    if (target_name) {
        target_col = project_language_column(project_langs, *target_name);
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
        const auto parent = std::filesystem::path(out_xliff_path).parent_path();
        if (!parent.empty()) {
            std::filesystem::create_directories(parent, ec);
            if (ec) {
                r.error = "Failed to create output directory: " + parent.string();
                return r;
            }
        }
    }

    XmlDocument out;
    out.xml_declaration = "<?xml version=\"1.0\" encoding=\"utf-8\"?>";

    XmlNode root;
    root.name = "xliff";

    if (version >= 2) {
        root.attrs.push_back({"xmlns", "urn:oasis:names:tc:xliff:document:2.0"});
        root.attrs.push_back({"version", "2.0"});
        root.attrs.push_back({"srcLang", *src_id});
        root.attrs.push_back({"trgLang", *target_id});

        XmlNode file;
        file.name = "file";
        file.attrs.push_back({"id", "f1"});
        file.attrs.push_back({"original", gxp_path});

        int unit_index = 0;
        for (const auto& rec : st->children) {
            if (rec.name != "string_record") continue;
            const auto id = first_text_child(rec, "id").value_or(std::string{});
            if (id.empty()) continue;

            std::vector<std::string> vals;
            for (const auto& c : rec.children) {
                if (c.name == "val") vals.push_back(c.text);
            }
            if (static_cast<int>(vals.size()) <= *src_col) continue;

            const auto src_text = vals[*src_col];
            if (src_text.empty()) {
                unit_index++;
                continue;
            }

            XmlNode unit;
            unit.name = "unit";
            unit.attrs.push_back({"id", std::to_string(unit_index)});
            unit.attrs.push_back({"name", id});

            XmlNode segment;
            segment.name = "segment";

            segment.children.push_back(XmlNode{"source", src_text, {}, {}});
            if (target_col && static_cast<int>(vals.size()) > *target_col) {
                segment.children.push_back(XmlNode{"target", vals[*target_col], {}, {}});
            }

            unit.children.push_back(std::move(segment));
            file.children.push_back(std::move(unit));

            r.unit_count++;
            unit_index++;
        }

        root.children.push_back(std::move(file));
    } else {
        root.attrs.push_back({"version", "1.2"});
        root.attrs.push_back({"xmlns", "urn:oasis:names:tc:xliff:document:1.2"});

        XmlNode file;
        file.name = "file";
        file.attrs.push_back({"original", gxp_path});
        file.attrs.push_back({"source-language", *src_id});
        file.attrs.push_back({"target-language", *target_id});
        file.attrs.push_back({"datatype", "plaintext"});

        XmlNode body;
        body.name = "body";

        for (const auto& rec : st->children) {
            if (rec.name != "string_record") continue;
            const auto id = first_text_child(rec, "id").value_or(std::string{});
            if (id.empty()) continue;

            std::vector<std::string> vals;
            for (const auto& c : rec.children) {
                if (c.name == "val") vals.push_back(c.text);
            }
            if (static_cast<int>(vals.size()) <= *src_col) continue;

            const auto src_text = vals[*src_col];
            if (src_text.empty()) {
                continue;
            }

            XmlNode tu;
            tu.name = "trans-unit";
            tu.attrs.push_back({"id", id});

            tu.children.push_back(XmlNode{"source", src_text, {}, {}});
            if (target_col && static_cast<int>(vals.size()) > *target_col) {
                tu.children.push_back(XmlNode{"target", vals[*target_col], {}, {}});
            }

            body.children.push_back(std::move(tu));
            r.unit_count++;
        }

        file.children.push_back(std::move(body));
        root.children.push_back(std::move(file));
    }

    out.root = std::move(root);

    std::string write_err;
    if (!write_xml_file(out_xliff_path, out, &write_err)) {
        r.error = write_err;
        return r;
    }

    r.ok = true;
    return r;
}

StringsImportXliffResult import_strings_xliff_to_gxp(const std::string& gxp_path,
                                                    const std::string& xliff_path,
                                                    const std::string& out_gxp_path) {
    StringsImportXliffResult r;

    auto gxp = parse_xml_file(gxp_path);
    if (!gxp.ok) {
        r.error = gxp.error;
        return r;
    }

    const auto project_langs_before = extract_project_language_names(gxp.doc);
    if (project_langs_before.empty()) {
        r.error = "Missing <language_names>";
        return r;
    }

    auto xliff = parse_xml_file(xliff_path);
    if (!xliff.ok) {
        r.error = xliff.error;
        return r;
    }

    const auto& root = xliff.doc.root;
    if (root.name != "xliff") {
        r.error = "XLIFF root element is not <xliff>";
        return r;
    }

    const auto version_s = attr_value(root, "version").value_or(std::string{});
    double version = 0.0;
    try {
        version = std::stod(version_s);
    } catch (...) {
        version = 0.0;
    }

    std::string src_id;
    std::string trg_id;

    if (version >= 2.0) {
        src_id = attr_value(root, "srcLang").value_or(std::string{});
        trg_id = attr_value(root, "trgLang").value_or(std::string{});
    } else {
        // v1.2 stores language info on <file>
        const auto* file = root.firstChild("file");
        if (!file) {
            r.error = "Missing <file>";
            return r;
        }
        src_id = attr_value(*file, "source-language").value_or(std::string{});
        trg_id = attr_value(*file, "target-language").value_or(std::string{});
    }

    if (src_id.empty() || trg_id.empty()) {
        r.error = "Missing source/target language in XLIFF";
        return r;
    }

    const auto src_name = language_name_for_id(src_id);
    const auto trg_name = language_name_for_id(trg_id);
    if (!src_name || !trg_name) {
        r.error = "Unsupported language id in XLIFF (srcLang/trgLang): " + src_id + ", " + trg_id;
        return r;
    }

    // Source language must exist in project.
    const auto project_langs = extract_project_language_names(gxp.doc);
    const auto src_col = project_language_column(project_langs, *src_name);
    if (!src_col) {
        r.error = "The specified source language is not included in this project: " + *src_name;
        return r;
    }

    // Ensure target exists (may add to project).
    int added_langs = 0;
    const int target_col = ensure_language_exists_in_project(gxp.doc, *trg_name, &added_langs);
    r.added_languages = added_langs;

    // Target might shift language vector; re-fetch count.
    const auto project_langs_after = extract_project_language_names(gxp.doc);
    const int lang_count = static_cast<int>(project_langs_after.size());

    auto* display = select_display(gxp.doc.root);
    if (!display) {
        r.error = "Missing <display_info>";
        return r;
    }
    auto* st = display->firstChild("string_table");
    if (!st) {
        // Create if missing.
        display->children.push_back(XmlNode{"string_table", "", {}, {}});
        st = &display->children.back();
    }

    auto apply_record_update = [&](const std::string& string_id, const std::string& src_text, const std::optional<std::string>& trg_text) {
        if (string_id.empty()) return;

        XmlNode* rec = find_string_record_by_id(*st, string_id);
        if (!rec) {
            st->children.push_back(XmlNode{"string_record", "", {}, {}});
            rec = &st->children.back();
            set_or_add_child_text(*rec, "id", string_id);
            set_or_add_child_text(*rec, "font", "0");
            r.added_records++;
        }

        std::vector<std::string> vals;
        for (const auto& c : rec->children) {
            if (c.name == "val") vals.push_back(c.text);
        }
        if (static_cast<int>(vals.size()) < lang_count) {
            vals.resize(lang_count);
        }

        vals[*src_col] = src_text;
        if (trg_text) {
            vals[target_col] = *trg_text;
        }
        set_val_children(*rec, vals);
        r.updated_records++;
    };

    // Walk file contents.
    const auto* file = root.firstChild("file");
    if (!file) {
        r.error = "Missing <file>";
        return r;
    }

    if (version >= 2.0) {
        for (const auto& unit : file->children) {
            if (unit.name != "unit") continue;
            const auto string_id = attr_value(unit, "name").value_or(std::string{});

            // Find first <segment>.
            const XmlNode* segment = nullptr;
            for (const auto& c : unit.children) {
                if (c.name == "segment") {
                    segment = &c;
                    break;
                }
            }
            if (!segment) continue;

            const auto src_text = first_text_child(*segment, "source").value_or(std::string{});
            const auto trg_text = first_text_child(*segment, "target");

            apply_record_update(string_id, src_text, trg_text);
        }
    } else {
        const auto* body = file->firstChild("body");
        if (!body) {
            r.error = "Missing <body>";
            return r;
        }
        for (const auto& tu : body->children) {
            if (tu.name != "trans-unit") continue;
            const auto string_id = attr_value(tu, "id").value_or(std::string{});
            const auto src_text = first_text_child(tu, "source").value_or(std::string{});
            const auto trg_text = first_text_child(tu, "target");
            apply_record_update(string_id, src_text, trg_text);
        }
    }

    ensure_num_languages(*st, lang_count);
    update_num_strings(*st);

    std::string write_err;
    if (!write_xml_file(out_gxp_path, gxp.doc, &write_err)) {
        r.error = write_err;
        return r;
    }

    r.ok = true;
    return r;
}

} // namespace studio_core
