#include "xml_reader.h"

#include <fstream>
#include <sstream>

#include "xml_util.h"

namespace studio_core {

XmlReader::XmlReader() {
    m_section = {0, 0};
}

bool XmlReader::readFile(const std::string& path, std::string* error) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        if (error) {
            *error = "Unable to open file: " + path;
        }
        return false;
    }

    std::ostringstream out;
    out << in.rdbuf();
    m_buffer = out.str();
    if (m_buffer.empty()) {
        m_section = {0, 0};
    } else {
        m_section = {0, m_buffer.size() - 1};
    }
    m_stack.clear();
    return true;
}

std::optional<std::string> XmlReader::findTagValueInSection(const char* tagName) {
    const std::string open = std::string("<") + tagName + ">";
    const std::string close = std::string("</") + tagName + ">";

    if (m_buffer.empty() || m_section.end < m_section.start) {
        return std::nullopt;
    }

    const auto openPos = m_buffer.find(open, m_section.start);
    if (openPos == std::string::npos || openPos > m_section.end) {
        return std::nullopt;
    }

    const auto valueStart = openPos + open.size();
    const auto closePos = m_buffer.find(close, valueStart);
    if (closePos == std::string::npos || closePos > m_section.end + 1) {
        return std::nullopt;
    }

    return m_buffer.substr(valueStart, closePos - valueStart);
}

bool XmlReader::readString(const char* tagName, std::string& out) {
    auto value = findTagValueInSection(tagName);
    if (!value) {
        out.clear();
        return false;
    }

    out = xml_unescape(*value);
    return true;
}

bool XmlReader::readInt(const char* tagName, int& out, int defaultVal) {
    std::string s;
    if (!readString(tagName, s)) {
        out = defaultVal;
        return false;
    }

    try {
        size_t idx = 0;
        int v = std::stoi(s, &idx, 10);
        if (idx != s.size()) {
            out = defaultVal;
            return false;
        }
        out = v;
        return true;
    } catch (...) {
        out = defaultVal;
        return false;
    }
}

bool XmlReader::readBool(const char* tagName, bool& out) {
    std::string s;
    if (!readString(tagName, s)) {
        out = false;
        return false;
    }

    if (s == "TRUE" || s == "true") {
        out = true;
        return true;
    }
    if (s == "FALSE" || s == "false") {
        out = false;
        return true;
    }

    out = false;
    return false;
}

bool XmlReader::enterSection(const char* tagName) {
    const std::string open = std::string("<") + tagName + ">";
    const std::string close = std::string("</") + tagName + ">";

    if (m_buffer.empty() || m_section.end < m_section.start) {
        return false;
    }

    const auto openPos = m_buffer.find(open, m_section.start);
    if (openPos == std::string::npos || openPos > m_section.end) {
        return false;
    }

    const auto contentStart = openPos + open.size();
    const auto closePos = m_buffer.find(close, contentStart);
    if (closePos == std::string::npos || closePos > m_section.end + 1) {
        return false;
    }

    m_stack.push_back(m_section);
    if (closePos == 0) {
        m_section = {0, 0};
    } else {
        // keep section bounds within content
        const auto contentEnd = closePos == 0 ? 0 : closePos - 1;
        if (contentStart > contentEnd) {
            m_section = {contentStart, contentStart};
        } else {
            m_section = {contentStart, contentEnd};
        }
    }

    return true;
}

void XmlReader::closeSection() {
    if (!m_stack.empty()) {
        m_section = m_stack.back();
        m_stack.pop_back();
    }
}

} // namespace studio_core
