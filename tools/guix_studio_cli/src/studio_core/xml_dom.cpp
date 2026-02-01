#include "studio_core/xml_dom.h"

#include <cctype>
#include <fstream>
#include <sstream>

#include "studio_core/xml_util.h"

namespace studio_core {

static std::string read_all(const std::string& path, std::string* error) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        if (error) *error = "Unable to open file: " + path;
        return {};
    }
    std::ostringstream out;
    out << in.rdbuf();
    return out.str();
}

const XmlNode* XmlNode::firstChild(const char* childName) const {
    for (const auto& c : children) {
        if (c.name == childName) return &c;
    }
    return nullptr;
}

XmlNode* XmlNode::firstChild(const char* childName) {
    for (auto& c : children) {
        if (c.name == childName) return &c;
    }
    return nullptr;
}

std::vector<const XmlNode*> XmlNode::childrenNamed(const char* childName) const {
    std::vector<const XmlNode*> out;
    for (const auto& c : children) {
        if (c.name == childName) out.push_back(&c);
    }
    return out;
}

std::vector<XmlNode*> XmlNode::childrenNamed(const char* childName) {
    std::vector<XmlNode*> out;
    for (auto& c : children) {
        if (c.name == childName) out.push_back(&c);
    }
    return out;
}

static void skip_ws(std::string_view s, size_t& i) {
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) i++;
}

static bool starts_with(std::string_view s, size_t i, std::string_view prefix) {
    return i + prefix.size() <= s.size() && s.substr(i, prefix.size()) == prefix;
}

static bool consume_until(std::string_view s, size_t& i, std::string_view needle) {
    const auto pos = s.find(needle, i);
    if (pos == std::string_view::npos) return false;
    i = pos + needle.size();
    return true;
}

static std::optional<std::string> parse_name(std::string_view s, size_t& i) {
    skip_ws(s, i);
    size_t start = i;
    while (i < s.size()) {
        char c = s[i];
        if (std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '-' || c == ':') {
            i++;
            continue;
        }
        break;
    }
    if (i == start) return std::nullopt;
    return std::string(s.substr(start, i - start));
}

static void skip_attributes(std::string_view s, size_t& i) {
    // We do not support attributes; skip until '>' or '/>' while handling quoted strings.
    while (i < s.size()) {
        if (s[i] == '>') return;
        if (starts_with(s, i, "/>")) return;
        if (s[i] == '"') {
            i++;
            while (i < s.size() && s[i] != '"') i++;
            if (i < s.size()) i++;
            continue;
        }
        if (s[i] == '\'') {
            i++;
            while (i < s.size() && s[i] != '\'') i++;
            if (i < s.size()) i++;
            continue;
        }
        i++;
    }
}

static std::optional<XmlNode> parse_element(std::string_view s, size_t& i, std::string& error);

static void parse_text(std::string_view s, size_t& i, std::string& outText) {
    size_t start = i;
    while (i < s.size() && s[i] != '<') i++;
    if (i > start) {
        outText += xml_unescape(std::string(s.substr(start, i - start)));
    }
}

static bool skip_misc(std::string_view s, size_t& i, std::string& error) {
    skip_ws(s, i);
    if (starts_with(s, i, "<?")) {
        // processing instruction
        if (!consume_until(s, i, "?>")) {
            error = "Unterminated processing instruction";
            return false;
        }
        return true;
    }
    if (starts_with(s, i, "<!--")) {
        if (!consume_until(s, i, "-->")) {
            error = "Unterminated comment";
            return false;
        }
        return true;
    }
    if (starts_with(s, i, "<!DOCTYPE")) {
        // naive doctype: consume until '>'
        const auto start = i;
        if (!consume_until(s, i, ">")) {
            error = "Unterminated doctype";
            return false;
        }
        // Caller captures this separately.
        (void)start;
        return true;
    }
    return false;
}

static std::optional<XmlNode> parse_element(std::string_view s, size_t& i, std::string& error) {
    if (i >= s.size() || s[i] != '<') {
        error = "Expected '<'";
        return std::nullopt;
    }
    i++; // '<'

    if (i < s.size() && s[i] == '/') {
        error = "Unexpected closing tag";
        return std::nullopt;
    }

    auto name = parse_name(s, i);
    if (!name) {
        error = "Missing tag name";
        return std::nullopt;
    }

    skip_attributes(s, i);
    if (starts_with(s, i, "/>")) {
        i += 2;
        XmlNode node;
        node.name = *name;
        return node;
    }

    if (i >= s.size() || s[i] != '>') {
        error = "Expected '>'";
        return std::nullopt;
    }
    i++; // '>'

    XmlNode node;
    node.name = *name;

    while (i < s.size()) {
        if (starts_with(s, i, "</")) {
            i += 2;
            auto closeName = parse_name(s, i);
            if (!closeName) {
                error = "Missing closing tag name";
                return std::nullopt;
            }
            skip_ws(s, i);
            if (i >= s.size() || s[i] != '>') {
                error = "Expected '>' after closing tag";
                return std::nullopt;
            }
            i++;
            if (*closeName != node.name) {
                error = "Mismatched closing tag: expected </" + node.name + ">";
                return std::nullopt;
            }
            return node;
        }

        if (s[i] == '<') {
            // skip comments/PI/doctype inside
            if (skip_misc(s, i, error)) {
                // swallow misc; for doctype within body we ignore
                continue;
            }
            // child element
            auto child = parse_element(s, i, error);
            if (!child) return std::nullopt;
            node.children.push_back(std::move(*child));
            continue;
        }

        parse_text(s, i, node.text);
    }

    error = "Unterminated element <" + node.name + ">";
    return std::nullopt;
}

XmlParseResult parse_xml_string(const std::string& xml) {
    XmlParseResult r;
    std::string_view s(xml);
    size_t i = 0;

    std::string error;

    // Capture XML declaration if present.
    skip_ws(s, i);
    if (starts_with(s, i, "<?xml")) {
        const auto start = i;
        if (!consume_until(s, i, "?>")) {
            r.error = "Unterminated XML declaration";
            return r;
        }
        r.doc.xml_declaration = std::string(s.substr(start, i - start));
    }

    // Capture doctype if present.
    skip_ws(s, i);
    if (starts_with(s, i, "<!DOCTYPE")) {
        const auto start = i;
        if (!consume_until(s, i, ">")) {
            r.error = "Unterminated doctype";
            return r;
        }
        r.doc.doctype = std::string(s.substr(start, i - start));
    }

    // Skip any other misc before root.
    while (true) {
        size_t before = i;
        if (!skip_misc(s, i, error)) break;
        if (i == before) break;
        skip_ws(s, i);
    }

    skip_ws(s, i);
    if (i >= s.size()) {
        r.error = "Empty XML";
        return r;
    }

    if (s[i] != '<') {
        r.error = "Expected root element";
        return r;
    }

    auto root = parse_element(s, i, error);
    if (!root) {
        r.error = error;
        return r;
    }

    r.doc.root = std::move(*root);
    r.ok = true;
    return r;
}

XmlParseResult parse_xml_file(const std::string& path) {
    XmlParseResult r;
    std::string error;
    auto xml = read_all(path, &error);
    if (xml.empty() && !error.empty()) {
        r.error = error;
        return r;
    }
    r = parse_xml_string(xml);
    if (!r.ok) {
        r.error = path + ": " + r.error;
    }
    return r;
}

static void write_indent(std::string& out, int indentSpaces, int level) {
    out.append(static_cast<size_t>(indentSpaces * level), ' ');
}

static bool is_ws_only(std::string_view s) {
    for (char c : s) {
        if (!(c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v')) {
            return false;
        }
    }
    return true;
}

static void write_node(std::string& out, const XmlNode& node, const XmlWriteOptions& opts, int level) {
    write_indent(out, opts.indent_spaces, level);
    out += "<";
    out += node.name;
    out += ">";

    const bool has_children = !node.children.empty();
    const bool has_text = !node.text.empty() && !is_ws_only(node.text);

    if (has_children) {
        out += "\n";
        if (has_text) {
            // If node has both, emit text as its own indented line.
            write_indent(out, opts.indent_spaces, level + 1);
            out += xml_escape(node.text);
            out += "\n";
        }
        for (const auto& c : node.children) {
            write_node(out, c, opts, level + 1);
        }
        write_indent(out, opts.indent_spaces, level);
        out += "</";
        out += node.name;
        out += ">\n";
        return;
    }

    if (has_text) {
        out += xml_escape(node.text);
    }

    out += "</";
    out += node.name;
    out += ">\n";
}

std::string write_xml_string(const XmlDocument& doc, const XmlWriteOptions& opts) {
    std::string out;

    if (!doc.xml_declaration.empty()) {
        out += doc.xml_declaration;
        out += "\n";
    } else {
        out += "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";
    }

    if (!doc.doctype.empty()) {
        out += doc.doctype;
        out += "\n";
    }

    write_node(out, doc.root, opts, 0);

    if (!opts.add_trailing_newline) {
        while (!out.empty() && out.back() == '\n') out.pop_back();
    }

    return out;
}

bool write_xml_file(const std::string& path, const XmlDocument& doc, std::string* error, const XmlWriteOptions& opts) {
    std::ofstream out(path, std::ios::binary);
    if (!out) {
        if (error) *error = "Unable to open output file: " + path;
        return false;
    }
    const auto s = write_xml_string(doc, opts);
    out.write(s.data(), static_cast<std::streamsize>(s.size()));
    return true;
}

std::optional<std::string> node_text(const XmlNode& parent, const char* childName) {
    if (const auto* c = parent.firstChild(childName)) {
        return c->text;
    }
    return std::nullopt;
}

std::optional<int> node_int(const XmlNode& parent, const char* childName) {
    auto t = node_text(parent, childName);
    if (!t) return std::nullopt;
    try {
        size_t idx = 0;
        int val = std::stoi(*t, &idx, 10);
        if (idx != t->size()) return std::nullopt;
        return val;
    } catch (...) {
        return std::nullopt;
    }
}

std::optional<bool> node_bool(const XmlNode& parent, const char* childName) {
    auto t = node_text(parent, childName);
    if (!t) return std::nullopt;
    if (*t == "TRUE" || *t == "true" || *t == "1") return true;
    if (*t == "FALSE" || *t == "false" || *t == "0") return false;
    return std::nullopt;
}

} // namespace studio_core
