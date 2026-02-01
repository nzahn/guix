#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace studio_core {

struct XmlNode {
    std::string name;
    std::string text; // concatenated text nodes (trim preserved as-is)
    std::vector<XmlNode> children;

    const XmlNode* firstChild(const char* childName) const;
    XmlNode* firstChild(const char* childName);

    std::vector<const XmlNode*> childrenNamed(const char* childName) const;
    std::vector<XmlNode*> childrenNamed(const char* childName);
};

struct XmlDocument {
    std::string xml_declaration;
    std::string doctype;
    XmlNode root;
};

struct XmlParseResult {
    bool ok = false;
    std::string error;
    XmlDocument doc;
};

XmlParseResult parse_xml_file(const std::string& path);
XmlParseResult parse_xml_string(const std::string& xml);

struct XmlWriteOptions {
    int indent_spaces = 2;
    bool add_trailing_newline = true;
};

std::string write_xml_string(const XmlDocument& doc, const XmlWriteOptions& opts = {});
bool write_xml_file(const std::string& path, const XmlDocument& doc, std::string* error = nullptr, const XmlWriteOptions& opts = {});

// Convenience helpers for reading values.
std::optional<std::string> node_text(const XmlNode& parent, const char* childName);
std::optional<int> node_int(const XmlNode& parent, const char* childName);
std::optional<bool> node_bool(const XmlNode& parent, const char* childName);

} // namespace studio_core
