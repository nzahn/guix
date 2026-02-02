#include "studio_core/language_registry.h"

#include <cctype>
#include <string>

namespace studio_core {

namespace {

struct LanguageRecord {
    const char* name;
    const char* id;
};

// Keep this list aligned with `guix_studio/config_languages_dlg.cpp`.
static const LanguageRecord kLanguages[] = {
    {"Abkhaz", "ab"},
    {"Afar", "aa"},
    {"Afrikaans", "af"},
    {"Akan", "ak"},
    {"Albanian", "sq"},
    {"Amharic", "am"},
    {"Arabic", "ar"},
    {"Aragonese", "an"},
    {"Armenian", "hy"},
    {"Assamese", "as"},
    {"Avaric", "av"},
    {"Avestan", "ae"},
    {"Aymara", "ay"},
    {"Azerbaijani", "az"},
    {"Bamanankan", "bm"},
    {"Bangla", "bn"},
    {"Bashkir", "ba"},
    {"Basque", "eu"},
    {"Belarusian", "be"},
    {"Bihari", "bh"},
    {"Bislama", "bi"},
    {"Bosnian", "bs"},
    {"Breton", "br"},
    {"Bulgarian", "bg"},
    {"Burmese", "my"},
    {"Catalan", "ca"},
    {"Chamorro", "ch"},
    {"Chechen", "ce"},
    {"Chichewa", "ny"},
    {"Chinese", "zh"},
    {"Church Slavic", "cu"},
    {"Chuvash", "cv"},
    {"Cornish", "kw"},
    {"Corsican", "co"},
    {"Cree", "cr"},
    {"Croatian", "hr"},
    {"Czech", "cs"},
    {"Danish", "da"},
    {"Divehi", "dv"},
    {"Dutch", "nl"},
    {"Dzongkha", "dz"},
    {"English", "en"},
    {"Esperanto", "eo"},
    {"Estonian", "et"},
    {"Ewe", "ee"},
    {"Faroese", "fo"},
    {"Fijian", "fj"},
    {"Finnish", "fi"},
    {"French", "fr"},
    {"Frisian", "fy"},
    {"Fulah", "ff"},
    {"Galician", "gl"},
    {"Ganda", "lg"},
    {"Georgian", "ka"},
    {"German", "de"},
    {"Greek", "el"},
    {"Guarani", "gn"},
    {"Gujarati", "gu"},
    {"Haitian", "ht"},
    {"Hausa", "ha"},
    {"Hebrew", "he"},
    {"Herero", "hz"},
    {"Hindi", "hi"},
    {"Hiri Motu", "ho"},
    {"Hungarian", "hu"},
    {"Icelandic", "is"},
    {"Ido", "io"},
    {"Igbo", "ig"},
    {"Indonesian", "id"},
    {"Interlingue", "ie"},
    {"Interlingua", "ia"},
    {"Inuktitut", "iu"},
    {"Inupiaq", "ik"},
    {"Irish", "ga"},
    {"Italian", "it"},
    {"Japanese", "ja"},
    {"Javanese", "jv"},
    {"Kalaallisut", "kl"},
    {"Kannada", "kn"},
    {"Kanuri", "kr"},
    {"Kashmiri", "ks"},
    {"Kazakh", "kk"},
    {"Khmer", "km"},
    {"Kikuyu", "ki"},
    {"Kinyarwanda", "rw"},
    {"Kirghiz", "ky"},
    {"Komi", "kv"},
    {"Kongo", "kg"},
    {"Korean", "ko"},
    {"Kurdish", "ku"},
    {"Kwanyama", "kj"},
    {"Lao", "lo"},
    {"Latin", "la"},
    {"Latvian", "lv"},
    {"Limburgan", "li"},
    {"Lingala", "ln"},
    {"Lithuanian", "lt"},
    {"Luba-Katanga", "lu"},
    {"Luxembourgish", "lb"},
    {"Macedonian", "mk"},
    {"Malagasy", "mg"},
    {"Malay", "ms"},
    {"Malayalam", "ml"},
    {"Maltese", "mt"},
    {"Manx", "gv"},
    {"Maori", "mi"},
    {"Marathi", "mr"},
    {"Marshallese", "mh"},
    {"Mongolian", "mn"},
    {"Nauru", "na"},
    {"Navajo", "nv"},
    {"North Ndebele", "nd"},
    {"Nepali", "ne"},
    {"Northern Sami", "se"},
    {"Norwegian", "no"},
    {"Norwegian Bokmal", "nb"},
    {"Norwegian Nynorsk", "nn"},
    {"Occitan", "oc"},
    {"Ojibwa", "oj"},
    {"Oriya", "or"},
    {"Oromo", "om"},
    {"Ossetian", "os"},
    {"Pali", "pi"},
    {"Pashto", "ps"},
    {"Persian", "fa"},
    {"Polish", "pl"},
    {"Portuguese", "pt"},
    {"Punjabi", "pa"},
    {"Quechua", "qu"},
    {"Romanian", "ro"},
    {"Romansh", "rm"},
    {"Rundi", "rn"},
    {"Russian", "ru"},
    {"Samoan", "sm"},
    {"Sango", "sg"},
    {"Sanskrit", "sa"},
    {"Sardinian", "sc"},
    {"Scottish Gaelic", "gd"},
    {"Serbian", "sr"},
    {"Shona", "sn"},
    {"Sichuan Yi", "ii"},
    {"Sindhi", "sd"},
    {"Sinhala", "si"},
    {"Slovak", "sk"},
    {"Slovenian", "sl"},
    {"Somali", "so"},
    {"South Ndebele", "nr"},
    {"Southern Sotho", "st"},
    {"Spanish", "es"},
    {"Sundanese", "su"},
    {"Swahili", "sw"},
    {"Swati", "ss"},
    {"Swedish", "sv"},
    {"Tagalog", "tl"},
    {"Tahitian", "ty"},
    {"Tajik", "tg"},
    {"Tamil", "ta"},
    {"Tatar", "tt"},
    {"Telugu", "te"},
    {"Thai", "th"},
    {"Tibetan", "bo"},
    {"Tigrinya", "ti"},
    {"Tonga", "to"},
    {"Tsonga", "ts"},
    {"Tswana", "tn"},
    {"Turkish", "tr"},
    {"Turkmen", "tk"},
    {"Twi", "tw"},
    {"Uighur", "ug"},
    {"Ukrainian", "uk"},
    {"Urdu", "ur"},
    {"Uzbek", "uz"},
    {"Vietnamese", "vi"},
    {"Volapuk", "vo"},
    {"Welsh", "cy"},
    {"Western Frisian", "fy"},
    {"Wolof", "wo"},
    {"Xhosa", "xh"},
    {"Yiddish", "yi"},
    {"Yoruba", "yo"},
    {"Zhuang", "za"},
    {"Zulu", "zu"},
};

static bool iequals(std::string_view a, std::string_view b) {
    if (a.size() != b.size()) return false;
    for (size_t i = 0; i < a.size(); ++i) {
        const auto ca = static_cast<unsigned char>(a[i]);
        const auto cb = static_cast<unsigned char>(b[i]);
        if (std::tolower(ca) != std::tolower(cb)) return false;
    }
    return true;
}

static constexpr int kLanguageCount = static_cast<int>(sizeof(kLanguages) / sizeof(kLanguages[0]));

} // namespace

std::optional<int> language_index_for_id(std::string_view id) {
    for (int i = 0; i < kLanguageCount; ++i) {
        if (kLanguages[i].id && iequals(kLanguages[i].id, id)) return i;
    }
    return std::nullopt;
}

std::optional<int> language_index_for_name(std::string_view name) {
    for (int i = 0; i < kLanguageCount; ++i) {
        if (kLanguages[i].name && iequals(kLanguages[i].name, name)) return i;
    }
    return std::nullopt;
}

std::optional<std::string> language_id_for_index(int index) {
    if (index < 0 || index >= kLanguageCount) return std::nullopt;
    return std::string(kLanguages[index].id);
}

std::optional<std::string> language_id_for_name(std::string_view name) {
    auto idx = language_index_for_name(name);
    if (!idx) return std::nullopt;
    return language_id_for_index(*idx);
}

std::optional<std::string> language_name_for_index(int index) {
    if (index < 0 || index >= kLanguageCount) return std::nullopt;
    return std::string(kLanguages[index].name);
}

std::optional<std::string> language_name_for_id(std::string_view id) {
    auto idx = language_index_for_id(id);
    if (!idx) return std::nullopt;
    return language_name_for_index(*idx);
}

} // namespace studio_core
