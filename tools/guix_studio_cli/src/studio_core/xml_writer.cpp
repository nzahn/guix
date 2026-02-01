#include "xml_writer.h"

#include "xml_util.h"

namespace studio_core {

bool XmlWriter::openFile(const std::string& path, std::string* error) {
    m_out.open(path, std::ios::binary);
    if (!m_out) {
        if (error) {
            *error = "Unable to open output file: " + path;
        }
        return false;
    }
    m_indent = 0;
    return true;
}

void XmlWriter::closeFile() {
    if (m_out.is_open()) {
        m_out.flush();
        m_out.close();
    }
}

void XmlWriter::writeHeader(const char* docType) {
    m_out << "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";
    if (docType) {
        m_out << "<!DOCTYPE " << docType << ">\n";
    }
}

void XmlWriter::indent() {
    for (int i = 0; i < m_indent; ++i) {
        m_out << "  ";
    }
}

void XmlWriter::openTag(const char* tag) {
    indent();
    m_out << "<" << tag << ">\n";
    ++m_indent;
}

void XmlWriter::closeTag(const char* tag) {
    if (m_indent > 0) {
        --m_indent;
    }
    indent();
    m_out << "</" << tag << ">\n";
}

void XmlWriter::writeString(const char* tag, const std::string& value) {
    indent();
    m_out << "<" << tag << ">" << xml_escape(value) << "</" << tag << ">\n";
}

void XmlWriter::writeInt(const char* tag, int value) {
    writeString(tag, std::to_string(value));
}

void XmlWriter::writeBool(const char* tag, bool value) {
    writeString(tag, value ? "TRUE" : "FALSE");
}

} // namespace studio_core
