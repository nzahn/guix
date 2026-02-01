#pragma once

#include <optional>
#include <string>
#include <vector>

namespace studio_core {

class XmlReader {
  public:
    XmlReader();

    bool readFile(const std::string& path, std::string* error = nullptr);
    bool readString(const char* tagName, std::string& out);
    bool readInt(const char* tagName, int& out, int defaultVal = 0);
    bool readBool(const char* tagName, bool& out);

    bool enterSection(const char* tagName);
    void closeSection();

  private:
    struct Section {
        size_t start = 0;
        size_t end = 0; // inclusive
    };

    std::string m_buffer;
    Section m_section;
    std::vector<Section> m_stack;

    std::optional<std::string> findTagValueInSection(const char* tagName);
};

} // namespace studio_core
