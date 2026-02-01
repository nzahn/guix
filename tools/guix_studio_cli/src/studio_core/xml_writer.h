#pragma once

#include <fstream>
#include <optional>
#include <string>
#include <vector>

namespace studio_core {

class XmlWriter {
  public:
    XmlWriter() = default;

    bool openFile(const std::string& path, std::string* error = nullptr);
    void closeFile();

    void writeHeader(const char* docType);

    void openTag(const char* tag);
    void closeTag(const char* tag);

    void writeString(const char* tag, const std::string& value);
    void writeInt(const char* tag, int value);
    void writeBool(const char* tag, bool value);

  private:
    std::ofstream m_out;
    int m_indent = 0;

    void indent();
};

} // namespace studio_core
