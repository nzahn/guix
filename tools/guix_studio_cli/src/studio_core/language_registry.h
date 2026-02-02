#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace studio_core {

// Mirrors GUIX Studio's language list (see guix_studio/config_languages_dlg.cpp).
// This provides name/id/index lookups for XLIFF/CSV string import/export.

std::optional<int> language_index_for_id(std::string_view id);
std::optional<int> language_index_for_name(std::string_view name);

std::optional<std::string> language_id_for_index(int index);
std::optional<std::string> language_id_for_name(std::string_view name);

std::optional<std::string> language_name_for_index(int index);
std::optional<std::string> language_name_for_id(std::string_view id);

} // namespace studio_core
