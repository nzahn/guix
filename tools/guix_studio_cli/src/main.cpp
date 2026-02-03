#include <algorithm>
#include <cstdlib>
#include <cctype>
#include <cstring>
#include <filesystem>
#include <functional>
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include "third_party/lodepng.h"

static void write_u16(std::ostream& os, uint16_t v, bool big_endian) {
    unsigned char b[2];
    if (big_endian) {
        b[0] = static_cast<unsigned char>((v >> 8) & 0xFF);
        b[1] = static_cast<unsigned char>(v & 0xFF);
    } else {
        b[0] = static_cast<unsigned char>(v & 0xFF);
        b[1] = static_cast<unsigned char>((v >> 8) & 0xFF);
    }
    os.write(reinterpret_cast<const char*>(b), 2);
}

static void write_u32(std::ostream& os, uint32_t v, bool big_endian) {
    unsigned char b[4];
    if (big_endian) {
        b[0] = static_cast<unsigned char>((v >> 24) & 0xFF);
        b[1] = static_cast<unsigned char>((v >> 16) & 0xFF);
        b[2] = static_cast<unsigned char>((v >> 8) & 0xFF);
        b[3] = static_cast<unsigned char>(v & 0xFF);
    } else {
        b[0] = static_cast<unsigned char>(v & 0xFF);
        b[1] = static_cast<unsigned char>((v >> 8) & 0xFF);
        b[2] = static_cast<unsigned char>((v >> 16) & 0xFF);
        b[3] = static_cast<unsigned char>((v >> 24) & 0xFF);
    }
    os.write(reinterpret_cast<const char*>(b), 4);
}

static void write_u8(std::ostream& os, uint8_t v) {
    const unsigned char b[1] = {static_cast<unsigned char>(v)};
    os.write(reinterpret_cast<const char*>(b), 1);
}

static uint32_t align_up_u32(uint32_t v, uint32_t a) {
    if (a == 0) return v;
    const uint32_t rem = v % a;
    return rem ? (v + (a - rem)) : v;
}

static uint32_t pad_bytes_to_alignment(uint32_t absolute_pos, uint32_t alignment) {
    const uint32_t aligned = align_up_u32(absolute_pos, alignment);
    return aligned - absolute_pos;
}

static void write_zeros(std::ostream& os, uint32_t count) {
    if (count == 0) return;
    static constexpr char kZeros[64] = {0};
    uint32_t remaining = count;
    while (remaining) {
        const uint32_t chunk = std::min<uint32_t>(remaining, static_cast<uint32_t>(sizeof(kZeros)));
        os.write(kZeros, static_cast<std::streamsize>(chunk));
        remaining -= chunk;
    }
}

struct BinresStringTable {
    std::vector<std::string> language_names;
    uint16_t string_count = 0; // includes the reserved index 0
    // strings[lang_index][string_index], where string_index runs [0, string_count)
    std::vector<std::vector<std::optional<std::string>>> strings;
};

struct BinresThemeData {
    uint16_t theme_id = 0;
    std::vector<uint32_t> colors;

    struct FontEntry {
        uint16_t index = 0;
        uint8_t bits = 8;
        // Phase-1: emit system default fonts so binres is loadable without embedding glyph data.
        bool is_default = true;
    };

    std::vector<FontEntry> fonts;

    struct PixelmapEntry {
        // GUIX binres pixelmap IDs start at 1; index 0 is reserved.
        uint16_t index = 1;
        uint8_t format = 22; // GX_COLOR_FORMAT_32ARGB

        // If present, this pixelmap corresponds to a file-backed resource.
        // Phase-2: we emit a minimal placeholder payload for these to validate
        // header/data sizing + alignment contracts.
        std::optional<std::filesystem::path> source_path;
        bool output_file_enabled = false;
        bool binary_mode = false;
        bool raw = false;
    };

    std::vector<PixelmapEntry> pixelmaps;

    struct ScrollbarAppearance {
        uint16_t scroll_width = 0;
        uint16_t thumb_width = 0;
        uint16_t thumb_travel_min = 0;
        uint16_t thumb_travel_max = 0;
        uint8_t thumb_border_style = 0;

        uint32_t scroll_fill_pixelmap = 0;
        uint32_t scroll_thumb_pixelmap = 0;
        uint32_t scroll_up_pixelmap = 0;
        uint32_t scroll_down_pixelmap = 0;
        uint32_t scroll_thumb_color = 0;
        uint32_t scroll_thumb_border_color = 0;
        uint32_t scroll_button_color = 0;
    };

    ScrollbarAppearance vscroll;
    ScrollbarAppearance hscroll;
    uint32_t vscroll_style = 0;
    uint32_t hscroll_style = 0;
};

static bool write_binres_with_strings(
    std::ostream& os,
    bool include_resource_header,
    bool big_endian,
    const std::vector<BinresThemeData>& themes,
    const BinresStringTable& string_table,
    std::string* error) {
    // Minimal-but-loadable GUIX binres image:
    // - 1 theme header with zero resources
    // - string tables populated from the project
    //
    // String encoding follows `gx_binres_loader` for version >= GX_BINRES_VERSION_ADD_STRING_LENGTH:
    //   USHORT length; then `length` bytes; then NUL.

    constexpr uint16_t GX_MAGIC_NUMBER = 0x4758U; // "GX"
    constexpr uint16_t GX_BINRES_VERSION_ADD_STRING_LENGTH = 50600; // gx_binres_loader.h

    constexpr uint32_t GX_THEME_HEADER_SIZE = 114;
    constexpr uint32_t GX_STRING_HEADER_SIZE = 10;
    constexpr uint32_t GX_LANGUAGE_HEADER_SIZE = 72;
    constexpr uint32_t GX_LANGUAGE_HEADER_NAME_SIZE = 64;

    const uint16_t theme_count = static_cast<uint16_t>(themes.empty() ? 1 : themes.size());
    const uint16_t language_count = static_cast<uint16_t>(string_table.language_names.size());
    const uint16_t string_count = string_table.string_count;

    if (language_count == 0 || string_count == 0) {
        if (error) *error = "Invalid string table (no languages or no strings)";
        return false;
    }
    if (string_table.strings.size() != language_count) {
        if (error) *error = "Invalid string table (language/string shape mismatch)";
        return false;
    }
    for (size_t li = 0; li < string_table.strings.size(); ++li) {
        if (string_table.strings[li].size() != string_count) {
            if (error) *error = "Invalid string table (string_count mismatch)";
            return false;
        }
    }

    auto calc_language_data_size = [&](size_t lang_index) -> uint32_t {
        uint32_t size = 0;
        for (uint16_t si = 1; si < string_count; ++si) {
            size += 2; // length field
            const auto& sopt = string_table.strings[lang_index][si];
            if (sopt && !sopt->empty()) {
                const uint32_t len = static_cast<uint32_t>(sopt->size());
                size += len + 1; // bytes + NUL
            }
        }
        return size;
    };

    const uint32_t GX_COLOR_HEADER_SIZE = 8;
    const uint32_t GX_FONT_HEADER_SIZE = 16;
    const uint32_t GX_PIXELMAP_HEADER_SIZE = 32;

    // Studio uses the pixelmap header's `data_offset` field to reference an
    // already-emitted pixelmap payload (often in an earlier theme) to avoid
    // duplicating data.
    //
    // Key: normalized source path string
    // Val: absolute file offset of the referenced GX_PIXELMAP_HEADER
    std::unordered_map<std::string, uint32_t> pixelmap_payload_header_by_source;

    struct PixelmapEmitPlan {
        uint32_t header_abs_offset = 0;
        uint32_t padding = 0;
        uint32_t map_size = 0;
        uint32_t aux_data_size = 0;
        uint32_t data_size = 0;
        uint32_t data_offset = 0;
        uint16_t width = 1;
        uint16_t height = 1;
        uint8_t flags = 0;
        std::vector<uint32_t> map_words;
        bool has_payload = false;
        bool is_reference = false;
    };

    struct ThemeSectionSizes {
        uint16_t color_count = 0;
        uint16_t font_count = 0;
        uint16_t pixelmap_count = 0;

        uint32_t color_section_size = 0;
        uint32_t font_section_size = 0;
        uint32_t pixelmap_section_size = 0;
        uint32_t theme_total_data_size = 0;

        std::vector<PixelmapEmitPlan> pixelmap_plans;
    };

    auto should_emit_pixelmap_payload = [&](const BinresThemeData::PixelmapEntry& pm) -> bool {
        // Phase-2: only emit minimal payloads for file-backed pixelmaps that are
        // intended to be embedded in the theme binres (not standalone output).
        if (!pm.source_path.has_value()) return false;
        if (pm.output_file_enabled && pm.binary_mode) return false;
        (void)pm.raw; // reserved for a later raw-byte emission path
        return true;
    };

    auto decode_png_as_argb32_words = [&](const std::filesystem::path& png_path,
                                         std::vector<uint32_t>& out_words,
                                         uint16_t& out_width,
                                         uint16_t& out_height,
                                         std::string& out_err) -> bool {
        unsigned char* rgba = nullptr;
        unsigned w = 0;
        unsigned h = 0;
        const std::string filename = png_path.string();
        const unsigned err = lodepng_decode32_file(&rgba, &w, &h, filename.c_str());
        if (err) {
            out_err = "PNG decode failed (" + filename + "): " + std::string(lodepng_error_text(err));
            return false;
        }
        if (!rgba || w == 0 || h == 0) {
            if (rgba) {
                free(rgba);
            }
            out_err = "PNG decode returned empty image (" + filename + ")";
            return false;
        }
        if (w > 0xFFFFu || h > 0xFFFFu) {
            free(rgba);
            out_err = "PNG dimensions exceed GX_VALUE limit (" + filename + ")";
            return false;
        }

        const size_t pixel_count = static_cast<size_t>(w) * static_cast<size_t>(h);
        out_words.resize(pixel_count);

        for (size_t i = 0; i < pixel_count; ++i) {
            const unsigned char r = rgba[i * 4 + 0];
            const unsigned char g = rgba[i * 4 + 1];
            const unsigned char b = rgba[i * 4 + 2];
            const unsigned char a = rgba[i * 4 + 3];
            const uint32_t argb = (static_cast<uint32_t>(a) << 24) |
                (static_cast<uint32_t>(r) << 16) |
                (static_cast<uint32_t>(g) << 8) |
                static_cast<uint32_t>(b);
            out_words[i] = argb;
        }

        free(rgba);
        out_width = static_cast<uint16_t>(w);
        out_height = static_cast<uint16_t>(h);
        return true;
    };

    std::string fatal_asset_error;

    auto compute_theme_section_sizes = [&](const BinresThemeData& theme, uint32_t absolute_theme_start) -> ThemeSectionSizes {
        ThemeSectionSizes s;

        s.color_count = static_cast<uint16_t>(std::min<size_t>(theme.colors.size(), 0xFFFF));
        s.font_count = static_cast<uint16_t>(std::min<size_t>(theme.fonts.size(), 0xFFFF));
        s.pixelmap_count = static_cast<uint16_t>(std::min<size_t>(theme.pixelmaps.size(), 0xFFFF));

        s.color_section_size = theme.colors.empty() ? 0U : (GX_COLOR_HEADER_SIZE + static_cast<uint32_t>(s.color_count) * 4U);
        s.font_section_size = static_cast<uint32_t>(s.font_count) * GX_FONT_HEADER_SIZE;

        // Pixelmap sizing includes per-pixelmap payload + alignment padding.
        s.pixelmap_plans.resize(s.pixelmap_count);
        uint32_t pixelmap_abs_cursor = absolute_theme_start + GX_THEME_HEADER_SIZE + s.color_section_size + s.font_section_size;
        for (uint16_t i = 0; i < s.pixelmap_count; ++i) {
            const auto& pm = theme.pixelmaps[i];
            PixelmapEmitPlan plan;

            plan.header_abs_offset = pixelmap_abs_cursor;

            if (should_emit_pixelmap_payload(pm)) {
                // Phase-3: decode the source PNG and embed an uncompressed 32ARGB map.
                // Studio may choose different formats/compression based on project settings;
                // we keep this as an incremental correctness step.
                std::string decode_err;
                std::optional<std::string> source_key;
                if (pm.source_path.has_value()) {
                    source_key = pm.source_path->lexically_normal().generic_string();
                }

                if (source_key.has_value()) {
                    const auto it = pixelmap_payload_header_by_source.find(*source_key);
                    if (it != pixelmap_payload_header_by_source.end()) {
                        // Emit a header-only reference to previously-emitted pixelmap data.
                        plan.data_offset = it->second;
                        plan.is_reference = true;
                    }
                }

                if (!plan.is_reference && pm.source_path.has_value()) {
                    if (!std::filesystem::exists(*pm.source_path)) {
                        if (fatal_asset_error.empty()) {
                            fatal_asset_error = "Missing pixelmap source asset: " + pm.source_path->string();
                        }
                    } else if (!decode_png_as_argb32_words(*pm.source_path, plan.map_words, plan.width, plan.height, decode_err)) {
                        if (fatal_asset_error.empty()) {
                            fatal_asset_error = decode_err;
                        }
                    }
                }

                if (!plan.is_reference && pm.source_path.has_value() && fatal_asset_error.empty()) {
                    const uint32_t bytes = static_cast<uint32_t>(plan.map_words.size() * sizeof(uint32_t));
                    plan.map_size = bytes;
                    plan.aux_data_size = 0;
                    plan.data_size = bytes;
                    plan.has_payload = true;

                    // If the image uses alpha, mark it as such.
                    // GX_PIXELMAP_ALPHA is 0x04 per `common/inc/gx_api.h`.
                    bool any_alpha = false;
                    for (const uint32_t c : plan.map_words) {
                        if ((c & 0xFF000000u) != 0xFF000000u) {
                            any_alpha = true;
                            break;
                        }
                    }
                    if (any_alpha) {
                        plan.flags = 0x04;
                    }

                    const uint32_t data_output_pos = pixelmap_abs_cursor + GX_PIXELMAP_HEADER_SIZE;
                    plan.padding = pad_bytes_to_alignment(data_output_pos, 4);

                    if (source_key.has_value()) {
                        // Record the header offset as the reference target.
                        pixelmap_payload_header_by_source.emplace(*source_key, plan.header_abs_offset);
                    }
                } else if (!plan.is_reference && pm.source_path.has_value() && fatal_asset_error.empty()) {
                    // No payload emitted (unexpected). Keep header-only.
                }
            }

            s.pixelmap_plans[i] = std::move(plan);

            // Referenced and header-only pixelmaps emit only the header.
            const uint32_t block_size = (s.pixelmap_plans[i].has_payload)
                ? (GX_PIXELMAP_HEADER_SIZE + s.pixelmap_plans[i].padding + s.pixelmap_plans[i].data_size)
                : GX_PIXELMAP_HEADER_SIZE;
            s.pixelmap_section_size += block_size;
            pixelmap_abs_cursor += block_size;
        }

        s.theme_total_data_size = s.color_section_size + s.font_section_size + s.pixelmap_section_size; // palette not yet included

        return s;
    };

    // If we encountered a missing/undecodable required asset while computing layout,
    // fail fast with an actionable error.
    auto return_fatal_asset_error_if_any = [&]() -> bool {
        if (!fatal_asset_error.empty()) {
            if (error) {
                *error = fatal_asset_error;
            }
            return true;
        }
        return false;
    };

    // Pre-compute per-theme sizes using absolute offsets so pixelmap alignment/padding is stable.
    struct ComputedTheme {
        const BinresThemeData* theme = nullptr;
        ThemeSectionSizes sizes;
    };

    const uint32_t resource_header_size = include_resource_header ? 20U : 0U;
    std::vector<ComputedTheme> computed;
    computed.reserve(themes.empty() ? 1U : themes.size());

    uint32_t theme_data_size = 0;
    uint32_t theme_abs_cursor = resource_header_size;
    if (themes.empty()) {
        BinresThemeData empty;
        ComputedTheme ct;
        ct.theme = nullptr;
        ct.sizes = compute_theme_section_sizes(empty, theme_abs_cursor);
        computed.push_back(ct);
        theme_data_size = GX_THEME_HEADER_SIZE; // header only
    } else {
        for (const auto& t : themes) {
            ComputedTheme ct;
            ct.theme = &t;
            ct.sizes = compute_theme_section_sizes(t, theme_abs_cursor);
            if (return_fatal_asset_error_if_any()) {
                return false;
            }
            computed.push_back(ct);

            const uint32_t block = GX_THEME_HEADER_SIZE + ct.sizes.theme_total_data_size;
            theme_data_size += block;
            theme_abs_cursor += block;
        }
    }

    uint32_t string_tables_total_size = 0;
    std::vector<uint32_t> per_language_data_size;
    per_language_data_size.reserve(language_count);
    for (size_t li = 0; li < language_count; ++li) {
        const uint32_t lang_data = calc_language_data_size(li);
        per_language_data_size.push_back(lang_data);
        string_tables_total_size += (GX_LANGUAGE_HEADER_SIZE + lang_data);
    }

    const uint32_t string_data_size = GX_STRING_HEADER_SIZE + string_tables_total_size;
    const uint32_t data_size = theme_data_size + string_data_size;

    if (include_resource_header) {
        // GX_RESOURCE_HEADER (see common/inc/gx_api.h)
        write_u16(os, GX_MAGIC_NUMBER, big_endian);
        write_u16(os, GX_BINRES_VERSION_ADD_STRING_LENGTH, big_endian);
        write_u16(os, theme_count, big_endian);
        write_u16(os, language_count, big_endian);
        write_u32(os, theme_data_size, big_endian);
        write_u32(os, string_data_size, big_endian);
        write_u32(os, data_size, big_endian);
    }

    auto write_theme_header = [&](const BinresThemeData& theme, const ThemeSectionSizes& sizes) {
        // Layout must match reads in `common/src/gx_binres_theme_load.c`.
        write_u16(os, GX_MAGIC_NUMBER, big_endian);
        write_u16(os, theme.theme_id, big_endian);
        write_u16(os, sizes.color_count, big_endian);
        write_u16(os, 0, big_endian); // palette count
        write_u16(os, sizes.font_count, big_endian);
        write_u16(os, sizes.pixelmap_count, big_endian);

        // vscroll appearance
        write_u16(os, theme.vscroll.scroll_width, big_endian);
        write_u16(os, theme.vscroll.thumb_width, big_endian);
        write_u16(os, theme.vscroll.thumb_travel_min, big_endian);
        write_u16(os, theme.vscroll.thumb_travel_max, big_endian);
        write_u8(os, theme.vscroll.thumb_border_style);
        write_u32(os, theme.vscroll.scroll_fill_pixelmap, big_endian);
        write_u32(os, theme.vscroll.scroll_thumb_pixelmap, big_endian);
        write_u32(os, theme.vscroll.scroll_up_pixelmap, big_endian);
        write_u32(os, theme.vscroll.scroll_down_pixelmap, big_endian);
        write_u32(os, theme.vscroll.scroll_thumb_color, big_endian);
        write_u32(os, theme.vscroll.scroll_thumb_border_color, big_endian);
        write_u32(os, theme.vscroll.scroll_button_color, big_endian);

        // hscroll appearance
        write_u16(os, theme.hscroll.scroll_width, big_endian);
        write_u16(os, theme.hscroll.thumb_width, big_endian);
        write_u16(os, theme.hscroll.thumb_travel_min, big_endian);
        write_u16(os, theme.hscroll.thumb_travel_max, big_endian);
        write_u8(os, theme.hscroll.thumb_border_style);
        write_u32(os, theme.hscroll.scroll_fill_pixelmap, big_endian);
        write_u32(os, theme.hscroll.scroll_thumb_pixelmap, big_endian);
        write_u32(os, theme.hscroll.scroll_up_pixelmap, big_endian);
        write_u32(os, theme.hscroll.scroll_down_pixelmap, big_endian);
        write_u32(os, theme.hscroll.scroll_thumb_color, big_endian);
        write_u32(os, theme.hscroll.scroll_thumb_border_color, big_endian);
        write_u32(os, theme.hscroll.scroll_button_color, big_endian);

        write_u32(os, theme.vscroll_style, big_endian);
        write_u32(os, theme.hscroll_style, big_endian);

        write_u32(os, sizes.color_section_size, big_endian);
        write_u32(os, 0, big_endian); // palette data size
        write_u32(os, sizes.font_section_size, big_endian);
        write_u32(os, sizes.pixelmap_section_size, big_endian);
        write_u32(os, sizes.theme_total_data_size, big_endian);
    };

    auto write_color_section = [&](const BinresThemeData& theme) {
        if (theme.colors.empty()) {
            return;
        }

        const uint16_t count = static_cast<uint16_t>(std::min<size_t>(theme.colors.size(), 0xFFFF));
        const uint32_t data_bytes = static_cast<uint32_t>(count) * 4U;

        // GX_COLOR_HEADER
        write_u16(os, GX_MAGIC_NUMBER, big_endian);
        write_u16(os, count, big_endian);
        write_u32(os, data_bytes, big_endian);

        // GX_COLOR table (ULONG per entry)
        for (uint16_t i = 0; i < count; ++i) {
            write_u32(os, theme.colors[i], big_endian);
        }
    };

    auto write_font_section = [&](const BinresThemeData& theme) {
        if (theme.fonts.empty()) {
            return;
        }

        // GX_FONT_HEADER layout per `common/src/gx_binres_theme_load.c`:
        //   USHORT magic
        //   USHORT index
        //   USHORT page_count
        //   GX_UBYTE default
        //   GX_UBYTE bits
        //   ULONG data_size
        //   ULONG data_offset
        for (const auto& fe : theme.fonts) {
            write_u16(os, GX_MAGIC_NUMBER, big_endian);
            write_u16(os, fe.index, big_endian);
            write_u16(os, 0, big_endian); // page_count
            write_u8(os, static_cast<uint8_t>(fe.is_default ? 1 : 0));

            uint8_t bits = fe.bits;
            if (!(bits == 1 || bits == 4 || bits == 8)) {
                bits = 8;
            }
            write_u8(os, bits);

            write_u32(os, 0, big_endian); // data_size
            write_u32(os, 0, big_endian); // data_offset
        }
    };

    // Themes are serialized as:
    //   GX_THEME_HEADER
    //   [color section]
    //   [palette section]
    //   [font section]
    //   [pixelmap section]
    // repeated per theme.
    auto write_pixelmap_section_with_plans = [&](const BinresThemeData& theme, const ThemeSectionSizes& sizes) {
        if (theme.pixelmaps.empty()) {
            return;
        }

        // GX_PIXELMAP_HEADER layout per `common/src/gx_binres_theme_load.c`.
        // Phase-3: emit uncompressed 32ARGB payloads for file-backed pixelmaps.

        const size_t count = std::min(theme.pixelmaps.size(), sizes.pixelmap_plans.size());
        for (size_t i = 0; i < count; ++i) {
            const auto& pm = theme.pixelmaps[i];
            const auto& plan = sizes.pixelmap_plans[i];

            write_u16(os, GX_MAGIC_NUMBER, big_endian);
            write_u16(os, pm.index, big_endian);
            write_u8(os, 0); // version_major
            write_u8(os, 0); // version_minor
            write_u8(os, plan.flags);
            write_u8(os, pm.format);
            write_u32(os, plan.map_size, big_endian);
            write_u32(os, plan.aux_data_size, big_endian);
            write_u32(os, 0, big_endian); // transparent_color
            write_u16(os, plan.width, big_endian);
            write_u16(os, plan.height, big_endian);
            write_u32(os, plan.data_size, big_endian);
            write_u32(os, plan.data_offset, big_endian);

            if (!plan.has_payload) {
                continue;
            }

            write_zeros(os, plan.padding);

            // Payload: GX_COLOR words serialized with requested endianness.
            for (const uint32_t c : plan.map_words) {
                write_u32(os, c, big_endian);
            }
        }
    };

    if (themes.empty()) {
        // Minimal single theme.
        BinresThemeData empty;
        const ThemeSectionSizes sizes = compute_theme_section_sizes(empty, resource_header_size);
        write_theme_header(empty, sizes);
    } else {
        for (const auto& ct : computed) {
            const BinresThemeData& theme = *ct.theme;
            write_theme_header(theme, ct.sizes);
            write_color_section(theme);
            write_font_section(theme);
            write_pixelmap_section_with_plans(theme, ct.sizes);
        }
    }

    // GX_STRING_HEADER (10 bytes)
    write_u16(os, GX_MAGIC_NUMBER, big_endian);
    write_u16(os, language_count, big_endian);
    write_u16(os, string_count, big_endian);
    write_u32(os, string_tables_total_size, big_endian);

    // (GX_LANGUAGE_HEADER + string data) per language.
    for (uint16_t lang_index = 0; lang_index < language_count; ++lang_index) {
        // GX_LANGUAGE_HEADER (72 bytes)
        write_u16(os, GX_MAGIC_NUMBER, big_endian);
        write_u16(os, lang_index, big_endian);
        {
            char buf[GX_LANGUAGE_HEADER_NAME_SIZE] = {0};
            const std::string& name = string_table.language_names[lang_index];
            const size_t n = std::min(name.size(), static_cast<size_t>(GX_LANGUAGE_HEADER_NAME_SIZE - 1));
            memcpy(buf, name.data(), n);
            os.write(buf, GX_LANGUAGE_HEADER_NAME_SIZE);
        }
        write_u32(os, per_language_data_size[lang_index], big_endian);

        // String table entries (index 1..string_count-1)
        for (uint16_t si = 1; si < string_count; ++si) {
            const auto& sopt = string_table.strings[lang_index][si];
            if (!sopt || sopt->empty()) {
                write_u16(os, 0, big_endian);
                continue;
            }

            const auto& s = *sopt;
            if (s.size() > 0xFFFF) {
                if (error) *error = "String too large for binres (max 65535 bytes)";
                return false;
            }

            write_u16(os, static_cast<uint16_t>(s.size()), big_endian);
            os.write(s.data(), static_cast<std::streamsize>(s.size()));
            os.put('\0');
        }
    }

    if (!os) {
        if (error) *error = "Failed while writing binary resource output";
        return false;
    }

    return true;
}

static bool write_minimal_binres(std::ostream& os, bool include_resource_header, bool big_endian, std::string* error) {
    // This is a minimal, structurally valid GUIX binres image.
    // It intentionally contains zero colors/fonts/pixelmaps and an empty string table.
    //
    // Layout (little-endian, as expected by gx_binres_loader):
    //   GX_RESOURCE_HEADER
    //   GX_THEME_HEADER (1 theme)
    //   GX_STRING_HEADER
    //   GX_LANGUAGE_HEADER (1 language)
    //
    // Note: This is not yet Studio-parity resource generation; it's a correctness step
    // so loaders and tooling can recognize the file.

    // Constants from `common/inc/gx_api.h`.
    constexpr uint16_t GX_MAGIC_NUMBER = 0x4758U; // "GX"
    constexpr uint16_t GX_BINRES_VERSION_ADD_STRING_LENGTH = 50600; // gx_binres_loader.h

    constexpr uint32_t GX_THEME_HEADER_SIZE = 114;
    constexpr uint32_t GX_STRING_HEADER_SIZE = 10;
    constexpr uint32_t GX_LANGUAGE_HEADER_SIZE = 72;
    constexpr uint32_t GX_LANGUAGE_HEADER_NAME_SIZE = 64;

    const uint16_t theme_count = 1;
    const uint16_t language_count = 1;

    const uint32_t theme_data_size = GX_THEME_HEADER_SIZE * theme_count;
    const uint32_t string_data_size = GX_STRING_HEADER_SIZE + GX_LANGUAGE_HEADER_SIZE * language_count;
    const uint32_t data_size = theme_data_size + string_data_size;

    if (include_resource_header) {
        // GX_RESOURCE_HEADER
        write_u16(os, GX_MAGIC_NUMBER, big_endian);
        write_u16(os, GX_BINRES_VERSION_ADD_STRING_LENGTH, big_endian);
        write_u16(os, theme_count, big_endian);
        write_u16(os, language_count, big_endian);
        write_u32(os, theme_data_size, big_endian);
        write_u32(os, string_data_size, big_endian);
        write_u32(os, data_size, big_endian);
    }

    // GX_THEME_HEADER (114 bytes)
    write_u16(os, GX_MAGIC_NUMBER, big_endian);
    write_u16(os, 0, big_endian); // theme index
    write_u16(os, 0, big_endian); // color count
    write_u16(os, 0, big_endian); // palette count
    write_u16(os, 0, big_endian); // font count
    write_u16(os, 0, big_endian); // pixelmap count
    // GX_SCROLLBAR_APPEARANCE vscroll (2*GX_VALUE + 2*GX_VALUE + GX_UBYTE + 4*ULONG + 3*ULONG) = 38 bytes
    // But we don't want to duplicate struct layout assumptions; just write zeros for the remaining theme header.
    // We already emitted 12 bytes above; the rest of the theme header is 102 bytes.
    write_zeros(os, 102);

    // GX_STRING_HEADER (10 bytes)
    write_u16(os, GX_MAGIC_NUMBER, big_endian);
    write_u16(os, language_count, big_endian);
    write_u16(os, 0, big_endian); // string count
    write_u32(os, GX_LANGUAGE_HEADER_SIZE * language_count, big_endian);

    // GX_LANGUAGE_HEADER (72 bytes)
    write_u16(os, GX_MAGIC_NUMBER, big_endian);
    write_u16(os, 0, big_endian); // language index
    {
        // language name (64 bytes, NUL padded)
        const std::string name = "English";
        char buf[GX_LANGUAGE_HEADER_NAME_SIZE] = {0};
        const size_t n = std::min(name.size(), static_cast<size_t>(GX_LANGUAGE_HEADER_NAME_SIZE - 1));
        memcpy(buf, name.data(), n);
        os.write(buf, GX_LANGUAGE_HEADER_NAME_SIZE);
    }
    write_u32(os, 0, big_endian); // language data size

    if (!os) {
        if (error) *error = "Failed while writing binary resource output";
        return false;
    }

    return true;
}

#include "studio_core/gxp_migrate.h"
#include "studio_core/gxp_project.h"
#include "studio_core/resource_project.h"
#include "studio_core/resource_xml_export.h"
#include "studio_core/strings_csv.h"
#include "studio_core/strings_xliff.h"
#include "studio_core/xml_dom.h"
#include "studio_core/xml_writer.h"

namespace {

std::optional<std::string> arg_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags);
bool has_flag_any(const std::vector<std::string>& args, const std::vector<std::string>& flags);

constexpr const char* kVersion = "0.1.0";

struct ProjectHeader {
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;
    std::optional<std::string> project_name;
};

constexpr int kMinimumResourceXmlVersion = 56; // PROJECT_VERSION_INITIAL_RESOURCE_XML

std::string trim_copy(std::string s) {
    const auto is_space = [](unsigned char c) { return std::isspace(c) != 0; };
    while (!s.empty() && is_space(static_cast<unsigned char>(s.front()))) s.erase(s.begin());
    while (!s.empty() && is_space(static_cast<unsigned char>(s.back()))) s.pop_back();
    return s;
}

std::vector<std::string> split_csv_list(const std::optional<std::string>& s) {
    std::vector<std::string> out;
    if (!s || s->empty()) return out;

    std::string cur;
    for (char c : *s) {
        if (c == ',') {
            auto t = trim_copy(cur);
            if (!t.empty()) out.push_back(t);
            cur.clear();
        } else {
            cur.push_back(c);
        }
    }
    auto t = trim_copy(cur);
    if (!t.empty()) out.push_back(t);

    return out;
}

ProjectHeader parse_project_header(const std::string& gxp_path) {
    ProjectHeader header;
    const auto parsed = studio_core::parse_gxp_header(gxp_path);
    if (!parsed.ok) {
        return header;
    }

    if (parsed.header.project_version) header.project_version = std::to_string(*parsed.header.project_version);
    if (parsed.header.guix_version) header.guix_version = std::to_string(*parsed.header.guix_version);
    if (parsed.header.studio_version) header.studio_version = std::to_string(*parsed.header.studio_version);
    if (parsed.header.project_name) header.project_name = *parsed.header.project_name;
    return header;
}

std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c; break;
        }
    }
    return out;
}

std::optional<int> parse_int(const std::optional<std::string>& s) {
    if (!s || s->empty()) {
        return std::nullopt;
    }
    try {
        size_t idx = 0;
        int val = std::stoi(*s, &idx, 10);
        if (idx != s->size()) {
            return std::nullopt;
        }
        return val;
    } catch (...) {
        return std::nullopt;
    }
}

void print_usage(std::ostream& os) {
    os << "guix_studio_cli " << kVersion << "\n\n";
    os << "Phase-1 scaffolding CLI for the GUIX Studio VS Code extension.\n";
    os << "This currently supports best-effort project summaries, validation, and a minimal output generator.\n\n";
    os << "Usage:\n";
    os << "  guix_studio_cli --version\n";
    os << "  guix_studio_cli help\n";
    os << "  guix_studio_cli summary --project <path.gxp> [--json]\n";
    os << "  guix_studio_cli validate --project <path.gxp> [--json]\n\n";

    os << "  guix_studio_cli migrate --project <path.gxp> [--output <path.gxp> | --in-place] [--json]\n\n";

    os << "  guix_studio_cli format-gxp --project <path.gxp> [--output <path.gxp> | --in-place] [--json]\n\n";

    os << "  guix_studio_cli export-resource-xml --project <path.gxp> [--output_path <dir>] [--display/-d <name>] [--theme/-t <name,name,...>] [--json]\n";
    os << "  guix_studio_cli generate --project <path.gxp> [--output_path <dir>] [--resource/-r [base]] [--specification/-s [base]] [--binary/-b]";
    os << " [--display/-d <name>] [--theme/-t <name,name,...>] [--language/-l <name,name,...>] [--json]\n";
    os << "  guix_studio_cli generate --xml/-x <path.resource.xml> [--project_dir <dir>] [--output_path <dir>] [--binary/-b] [--big_endian] [--no_res_header] [--json]\n\n";

    os << "  guix_studio_cli binres-inspect --input <path.bin> [--big_endian] [--no_res_header] [--json]\n\n";

    os << "  guix_studio_cli export-strings --project <path.gxp> --output <path.csv> --src <lang> [--target <lang> | --targets <lang,lang,...>] [--json]\n";
    os << "  guix_studio_cli import-strings --project <path.gxp> --input <path.csv> [--output <path.gxp> | --in-place] [--json]\n\n";

    os << "  guix_studio_cli export-xliff --project <path.gxp> --output <path.xlf> --src <lang> --target <lang> [--version 1|2] [--json]\n";
    os << "  guix_studio_cli import-xliff --project <path.gxp> --input <path.xlf> [--output <path.gxp> | --in-place] [--json]\n\n";
    os << "Notes:\n";
    os << "  - This is NOT a full replacement for the legacy Studio generator yet.\n";
    os << "  - Phase 1 generation currently exports a minimal resource-project XML only.\n";
    os << "  - Future phases will implement Studio-compatible C/spec/bin/srec outputs.\n";
}

int cmd_binres_inspect(const std::vector<std::string>& args) {
    const auto input = arg_value_any(args, {"--input"});
    if (!input) {
        std::cerr << "Missing required flag: --input\n";
        return 2;
    }

    const bool big_endian = has_flag_any(args, {"--big_endian"});
    const bool no_res_header = has_flag_any(args, {"--no_res_header"});
    const bool json = has_flag_any(args, {"--json"});

    std::ifstream f(*input, std::ios::binary);
    if (!f) {
        std::cerr << "Unable to open input file: " << *input << "\n";
        return 2;
    }

    std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (bytes.size() < 2) {
        std::cerr << "Input too small to be a binres image\n";
        return 1;
    }

    auto require = [&](size_t off, size_t n) -> bool {
        return off + n <= bytes.size();
    };

    auto read_u16_at = [&](size_t off, uint16_t* out) -> bool {
        if (!require(off, 2)) return false;
        const uint16_t b0 = static_cast<uint16_t>(bytes[off + 0]);
        const uint16_t b1 = static_cast<uint16_t>(bytes[off + 1]);
        *out = big_endian ? static_cast<uint16_t>((b0 << 8) | b1) : static_cast<uint16_t>((b1 << 8) | b0);
        return true;
    };

    auto read_u32_at = [&](size_t off, uint32_t* out) -> bool {
        if (!require(off, 4)) return false;
        const uint32_t b0 = static_cast<uint32_t>(bytes[off + 0]);
        const uint32_t b1 = static_cast<uint32_t>(bytes[off + 1]);
        const uint32_t b2 = static_cast<uint32_t>(bytes[off + 2]);
        const uint32_t b3 = static_cast<uint32_t>(bytes[off + 3]);
        *out = big_endian
            ? ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)
            : ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0);
        return true;
    };

    constexpr uint16_t GX_MAGIC_NUMBER = 0x4758U;
    constexpr uint32_t GX_RESOURCE_HEADER_SIZE = 20;
    constexpr uint32_t GX_THEME_HEADER_SIZE = 114;

    const uint32_t resource_header_size = no_res_header ? 0U : GX_RESOURCE_HEADER_SIZE;
    uint16_t theme_count = 1;
    uint16_t language_count = 0;
    uint32_t theme_data_size = 0;

    if (!no_res_header) {
        uint16_t magic = 0;
        if (!read_u16_at(0, &magic) || magic != GX_MAGIC_NUMBER) {
            std::cerr << "Unexpected GX_RESOURCE_HEADER magic\n";
            return 1;
        }
        if (!read_u16_at(4, &theme_count) || !read_u16_at(6, &language_count)) {
            std::cerr << "Unable to read resource header counts\n";
            return 1;
        }
        if (!read_u32_at(8, &theme_data_size)) {
            std::cerr << "Unable to read resource header theme_data_size\n";
            return 1;
        }
        if (theme_count == 0) {
            std::cerr << "Invalid theme_count in resource header\n";
            return 1;
        }
    } else {
        theme_count = 1; // cannot be inferred without a resource header
    }

    std::vector<uint32_t> theme_offsets;
    std::vector<uint32_t> color_section_sizes;
    std::vector<uint32_t> font_section_sizes;
    std::vector<uint32_t> pixelmap_section_sizes;
    std::vector<uint32_t> theme_total_data_sizes;
    std::vector<uint32_t> pixelmap_section_offsets;

    theme_offsets.reserve(theme_count);
    color_section_sizes.reserve(theme_count);
    font_section_sizes.reserve(theme_count);
    pixelmap_section_sizes.reserve(theme_count);
    theme_total_data_sizes.reserve(theme_count);
    pixelmap_section_offsets.reserve(theme_count);

    uint32_t theme_off = resource_header_size;
    for (uint16_t ti = 0; ti < theme_count; ++ti) {
        uint16_t magic = 0;
        if (!read_u16_at(theme_off, &magic) || magic != GX_MAGIC_NUMBER) {
            std::cerr << "Unexpected GX_THEME_HEADER magic at theme index " << ti << "\n";
            return 1;
        }

        uint32_t color_size = 0;
        uint32_t palette_size = 0;
        uint32_t font_size = 0;
        uint32_t pixelmap_size = 0;
        uint32_t total_size = 0;

        if (!read_u32_at(theme_off + 94, &color_size) ||
            !read_u32_at(theme_off + 98, &palette_size) ||
            !read_u32_at(theme_off + 102, &font_size) ||
            !read_u32_at(theme_off + 106, &pixelmap_size) ||
            !read_u32_at(theme_off + 110, &total_size)) {
            std::cerr << "Unable to read theme section sizes at theme index " << ti << "\n";
            return 1;
        }

        const uint32_t color_off = theme_off + GX_THEME_HEADER_SIZE;
        const uint32_t font_off = color_off + color_size + palette_size;
        const uint32_t pixelmap_off = font_off + font_size;

        theme_offsets.push_back(theme_off);
        color_section_sizes.push_back(color_size);
        font_section_sizes.push_back(font_size);
        pixelmap_section_sizes.push_back(pixelmap_size);
        theme_total_data_sizes.push_back(total_size);
        pixelmap_section_offsets.push_back(pixelmap_off);

        theme_off = theme_off + GX_THEME_HEADER_SIZE + total_size;
    }

    const uint32_t string_header_offset = no_res_header
        ? (resource_header_size + GX_THEME_HEADER_SIZE + theme_total_data_sizes[0])
        : (resource_header_size + theme_data_size);

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"input\":\"" << json_escape(*input) << "\"";
        std::cout << ",\"big_endian\":" << (big_endian ? "true" : "false");
        std::cout << ",\"include_resource_header\":" << (no_res_header ? "false" : "true");
        std::cout << ",\"resource_header_size\":" << resource_header_size;
        std::cout << ",\"theme_count\":" << theme_count;
        if (!no_res_header) {
            std::cout << ",\"language_count\":" << language_count;
            std::cout << ",\"theme_data_size\":" << theme_data_size;
        }
        std::cout << ",\"string_header_offset\":" << string_header_offset;

        auto emit_u32_array = [&](const char* key, const std::vector<uint32_t>& vals) {
            std::cout << ",\"" << key << "\":[";
            for (size_t i = 0; i < vals.size(); ++i) {
                if (i) std::cout << ",";
                std::cout << vals[i];
            }
            std::cout << "]";
        };

        emit_u32_array("theme_offsets", theme_offsets);
        emit_u32_array("color_section_sizes", color_section_sizes);
        emit_u32_array("font_section_sizes", font_section_sizes);
        emit_u32_array("pixelmap_section_sizes", pixelmap_section_sizes);
        emit_u32_array("theme_total_data_sizes", theme_total_data_sizes);
        emit_u32_array("pixelmap_section_offsets", pixelmap_section_offsets);
        std::cout << "}\n";
        return 0;
    }

    std::cout << "Themes: " << theme_count << "\n";
    for (size_t i = 0; i < theme_offsets.size(); ++i) {
        std::cout << "  theme[" << i << "] off=" << theme_offsets[i] << " pixelmap_off=" << pixelmap_section_offsets[i] << "\n";
    }
    std::cout << "string_header_offset=" << string_header_offset << "\n";
    return 0;
}

int cmd_format_gxp(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const bool in_place = has_flag_any(args, {"--in-place"});
    const auto output_arg = arg_value_any(args, {"--output"});

    if (in_place && output_arg) {
        std::cerr << "Use only one of --output or --in-place\n";
        return 2;
    }

    std::filesystem::path out_path;
    if (in_place) {
        out_path = std::filesystem::path(*project);
    } else if (output_arg) {
        out_path = std::filesystem::path(*output_arg);
    } else {
        out_path = std::filesystem::path(*project).parent_path() / (std::filesystem::path(*project).stem().string() + ".formatted.gxp");
    }

    auto parsed = studio_core::parse_xml_file(*project);
    if (!parsed.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(parsed.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << parsed.error << "\n";
        return 1;
    }

    if (parsed.doc.doctype.find("GUIX_Studio_Project") == std::string::npos) {
        const std::string err = "Not a GUIX_Studio_Project (.gxp) file (missing/unknown doctype)";
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(err) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << err << "\n";
        return 1;
    }

    if (parsed.doc.root.name != "project") {
        const std::string err = "Root element is not <project>";
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(err) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << err << "\n";
        return 1;
    }

    std::string write_err;
    if (!studio_core::write_xml_file(out_path.string(), parsed.doc, &write_err)) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(write_err) << "\"}";
            std::cout << "\n";
            return 2;
        }
        std::cerr << write_err << "\n";
        return 2;
    }

    if (json) {
        std::cout << "{\"ok\":true,\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote formatted project: " << out_path.string() << "\n";
    return 0;
}

int cmd_export_xliff(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output = arg_value_any(args, {"--output"});
    if (!output) {
        std::cerr << "Missing required flag: --output\n";
        return 2;
    }

    const auto src = arg_value_any(args, {"--src"});
    if (!src) {
        std::cerr << "Missing required flag: --src\n";
        return 2;
    }

    const auto target = arg_value_any(args, {"--target"});
    if (!target) {
        std::cerr << "Missing required flag: --target\n";
        return 2;
    }

    const auto version = parse_int(arg_value_any(args, {"--version"})).value_or(2);
    const bool json = has_flag_any(args, {"--json"});

    const auto res = studio_core::export_strings_xliff_from_gxp(*project, *output, *src, *target, version);
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(*output) << "\"";
        std::cout << ",\"units\":" << res.unit_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote XLIFF: " << *output << "\n";
    return 0;
}

int cmd_import_xliff(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto input = arg_value_any(args, {"--input", "-i"});
    if (!input) {
        std::cerr << "Missing required flag: --input/-i\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const bool in_place = has_flag_any(args, {"--in-place"});
    const auto output_arg = arg_value_any(args, {"--output"});

    if (in_place && output_arg) {
        std::cerr << "Use only one of --output or --in-place\n";
        return 2;
    }

    std::filesystem::path out_path;
    if (in_place) {
        out_path = std::filesystem::path(*project);
    } else if (output_arg) {
        out_path = std::filesystem::path(*output_arg);
    } else {
        std::filesystem::path in_path(*project);
        out_path = in_path;
        out_path.replace_filename(in_path.stem().string() + ".xliff_imported" + in_path.extension().string());
    }

    const auto res = studio_core::import_strings_xliff_to_gxp(*project, *input, out_path.string());
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"input\":\"" << json_escape(*input) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";
        std::cout << ",\"updated_records\":" << res.updated_records;
        std::cout << ",\"added_records\":" << res.added_records;
        std::cout << ",\"added_languages\":" << res.added_languages;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote updated project: " << out_path.string() << "\n";
    return 0;
}

int cmd_export_strings(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output = arg_value_any(args, {"--output"});
    if (!output) {
        std::cerr << "Missing required flag: --output\n";
        return 2;
    }

    const auto src = arg_value_any(args, {"--src"});
    if (!src) {
        std::cerr << "Missing required flag: --src\n";
        return 2;
    }

    std::vector<std::string> targets;
    if (const auto target = arg_value_any(args, {"--target"})) {
        targets.push_back(*target);
    }
    if (const auto targets_csv = arg_value_any(args, {"--targets"})) {
        for (const auto& s : split_csv_list(targets_csv)) {
            if (!s.empty()) targets.push_back(s);
        }
    }

    if (targets.empty()) {
        std::cerr << "Missing required flag: --target or --targets\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const auto res = studio_core::export_strings_csv_from_gxp(*project, *output, *src, targets);
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(*output) << "\"";
        std::cout << ",\"src\":\"" << json_escape(*src) << "\"";
        std::cout << ",\"targets\":[";
        for (size_t i = 0; i < targets.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(targets[i]) << "\"";
        }
        std::cout << "]";
        std::cout << ",\"records\":" << res.record_count;
        std::cout << ",\"languages\":" << res.language_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote strings CSV: " << *output << "\n";
    return 0;
}

int cmd_import_strings(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto input = arg_value_any(args, {"--input", "-i"});
    if (!input) {
        std::cerr << "Missing required flag: --input/-i\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const bool in_place = has_flag_any(args, {"--in-place"});
    const auto output_arg = arg_value_any(args, {"--output"});

    if (in_place && output_arg) {
        std::cerr << "Use only one of --output or --in-place\n";
        return 2;
    }

    std::filesystem::path out_path;
    if (in_place) {
        out_path = std::filesystem::path(*project);
    } else if (output_arg) {
        out_path = std::filesystem::path(*output_arg);
    } else {
        std::filesystem::path in_path(*project);
        out_path = in_path;
        out_path.replace_filename(in_path.stem().string() + ".strings_imported" + in_path.extension().string());
    }

    const auto res = studio_core::import_strings_csv_to_gxp(*project, *input, out_path.string());
    if (!res.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(res.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << res.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"input\":\"" << json_escape(*input) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";
        std::cout << ",\"updated_records\":" << res.updated_records;
        std::cout << ",\"added_records\":" << res.added_records;
        std::cout << ",\"added_languages\":" << res.added_languages;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < res.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(res.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote updated project: " << out_path.string() << "\n";
    return 0;
}

std::optional<std::string> arg_value(const std::vector<std::string>& args, const std::string& flag) {
    for (size_t i = 0; i < args.size(); i++) {
        if (args[i] == flag && i + 1 < args.size()) {
            return args[i + 1];
        }
    }
    return std::nullopt;
}

bool has_flag(const std::vector<std::string>& args, const std::string& flag) {
    for (const auto& a : args) {
        if (a == flag) return true;
    }
    return false;
}

std::optional<std::string> arg_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        auto v = arg_value(args, f);
        if (v) {
            return v;
        }
    }
    return std::nullopt;
}

bool has_flag_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        if (has_flag(args, f)) {
            return true;
        }
    }
    return false;
}

struct FlagOptArg {
    bool present = false;
    std::optional<std::string> value;
};

// Returns whether a flag is present, and an optional value if the next token is not another flag.
// This matches legacy Studio behavior where `-r -s` is valid and implies default filenames.
FlagOptArg flag_optional_value_any(const std::vector<std::string>& args, const std::vector<std::string>& flags) {
    for (const auto& f : flags) {
        for (size_t i = 0; i < args.size(); i++) {
            if (args[i] != f) continue;

            FlagOptArg r;
            r.present = true;
            if (i + 1 < args.size()) {
                const auto& next = args[i + 1];
                if (!next.empty() && next[0] != '-') {
                    r.value = next;
                }
            }
            return r;
        }
    }
    return {};
}

static bool has_extension(const std::filesystem::path& p) {
    return p.has_extension() && !p.extension().string().empty();
}

int cmd_migrate(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const bool json = has_flag_any(args, {"--json"});
    const bool in_place = has_flag_any(args, {"--in-place"});
    const auto output_arg = arg_value_any(args, {"--output"});

    if (in_place && output_arg) {
        std::cerr << "Use only one of --output or --in-place\n";
        return 2;
    }

    std::filesystem::path out_path;
    if (in_place) {
        out_path = std::filesystem::path(*project);
    } else if (output_arg) {
        out_path = std::filesystem::path(*output_arg);
    } else {
        std::filesystem::path in_path(*project);
        out_path = in_path;
        out_path.replace_filename(in_path.stem().string() + ".migrated" + in_path.extension().string());
    }

    auto parsed = studio_core::parse_xml_file(*project);
    if (!parsed.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(parsed.error) << "\"}\n";
            return 1;
        }
        std::cerr << parsed.error << "\n";
        return 1;
    }

    auto mig = studio_core::migrate_gxp_to_latest(parsed.doc);
    if (!mig.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(mig.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << mig.error << "\n";
        return 1;
    }

    std::string err;
    if (!studio_core::write_xml_file(out_path.string(), parsed.doc, &err)) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(err) << "\"}\n";
            return 2;
        }
        std::cerr << err << "\n";
        return 2;
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project\":\"" << json_escape(*project) << "\"";
        std::cout << ",\"output\":\"" << json_escape(out_path.string()) << "\"";

        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < mig.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(mig.warnings[i]) << "\"";
        }
        std::cout << "]";

        std::cout << ",\"changes\":[";
        for (size_t i = 0; i < mig.changes.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(mig.changes[i]) << "\"";
        }
        std::cout << "]";

        std::cout << "}\n";
        return 0;
    }

    std::cout << "Wrote migrated project: " << out_path.string() << "\n";
    for (const auto& c : mig.changes) {
        std::cout << "  change: " << c << "\n";
    }
    for (const auto& w : mig.warnings) {
        std::cout << "  warning: " << w << "\n";
    }
    return 0;
}

std::filesystem::path default_output_dir_for_project(const std::filesystem::path& project_path) {
    auto parent = project_path.parent_path();
    if (parent.empty()) {
        return std::filesystem::current_path();
    }
    return parent;
}

int cmd_export_resource_xml(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto output_path_arg = arg_value(args, "--output_path");
    const auto display_arg = arg_value_any(args, {"--display", "-d"});
    const auto theme_arg = arg_value_any(args, {"--theme", "-t"});
    const bool json = has_flag(args, "--json");

    const auto header = parse_project_header(*project);
    if (!header.project_name || header.project_name->empty()) {
        std::cerr << "Missing <project_name>\n";
        return 1;
    }

    std::filesystem::path project_path_fs(*project);
    std::filesystem::path out_dir = output_path_arg ? std::filesystem::path(*output_path_arg)
                                                    : default_output_dir_for_project(project_path_fs);

    std::error_code ec;
    std::filesystem::create_directories(out_dir, ec);
    if (ec) {
        std::cerr << "Failed to create output directory: " << out_dir.string() << "\n";
        return 2;
    }

    const std::filesystem::path out_file = out_dir / (header.project_name.value() + ".resource.xml");

    studio_core::ResourceXmlExportOptions opts;
    if (display_arg && !display_arg->empty()) {
        opts.display_name = *display_arg;
    }
    if (theme_arg && !theme_arg->empty()) {
        opts.theme_names = split_csv_list(theme_arg);
    }

    const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string(), opts);
    if (!exported.ok) {
        if (json) {
            std::cout << "{\"ok\":false,\"error\":\"" << json_escape(exported.error) << "\"}";
            std::cout << "\n";
            return 1;
        }
        std::cerr << exported.error << "\n";
        return 1;
    }

    if (json) {
        std::cout << "{\"ok\":true,\"resource_xml\":\"" << json_escape(out_file.string()) << "\"";
        std::cout << ",\"pixelmaps\":" << exported.pixelmap_count;
        std::cout << ",\"fonts\":" << exported.font_count;
        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < exported.warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(exported.warnings[i]) << "\"";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    std::cout << "Wrote resource project XML: " << out_file.string() << "\n";
    return 0;
}

int cmd_generate(const std::vector<std::string>& args) {
    // Phase 1: implement legacy-ish CLI semantics but generate stub artifacts.
    // This lets the VS Code extension build UX without waiting for full generator parity.

    const auto project = arg_value_any(args, {"--project", "-p"});
    const auto xml_in = arg_value_any(args, {"--xml", "-x"});
    const auto project_dir_arg = arg_value_any(args, {"--project_dir"});
    const auto output_path_arg = arg_value_any(args, {"--output_path"});
    const bool json = has_flag_any(args, {"--json"});

    const auto resource_flag = flag_optional_value_any(args, {"--resource", "-r"});
    const auto spec_flag = flag_optional_value_any(args, {"--specification", "-s"});

    const bool gen_resource = resource_flag.present;
    const bool gen_specification = spec_flag.present;
    const bool binary = has_flag_any(args, {"--binary", "-b"});
    const bool big_endian = has_flag_any(args, {"--big_endian"});
    const bool no_res_header = has_flag_any(args, {"--no_res_header"});

    const auto display_arg = arg_value_any(args, {"--display", "-d"});
    const auto theme_arg = arg_value_any(args, {"--theme", "-t"});
    const auto language_arg = arg_value_any(args, {"--language", "-l"});

    const auto display_filters = split_csv_list(display_arg);
    const auto theme_filters = split_csv_list(theme_arg);
    const auto language_filters = split_csv_list(language_arg);

    std::vector<std::string> warnings;

    if (!project && !xml_in) {
        std::cerr << "Missing required flag: --project/-p or --xml/-x\n";
        return 2;
    }

    if (xml_in && (!display_filters.empty() || !theme_filters.empty() || !language_filters.empty())) {
        warnings.push_back("--display/--theme/--language are ignored when using --xml input");
    }

    std::optional<std::filesystem::path> xml_asset_base_dir;
    if (xml_in && project_dir_arg && !project_dir_arg->empty()) {
        std::filesystem::path base(*project_dir_arg);
        if (base.is_relative()) {
            base = (std::filesystem::current_path() / base).lexically_normal();
        }
        if (!std::filesystem::exists(base) || !std::filesystem::is_directory(base)) {
            std::cerr << "Invalid --project_dir (not a directory): " << base.string() << "\n";
            return 2;
        }
        xml_asset_base_dir = base;
    }

    // Resolve output dir.
    std::filesystem::path out_dir;
    if (output_path_arg) {
        out_dir = std::filesystem::path(*output_path_arg);
    } else if (project) {
        out_dir = default_output_dir_for_project(std::filesystem::path(*project));
    } else {
        out_dir = std::filesystem::current_path();
    }

    std::error_code ec;
    std::filesystem::create_directories(out_dir, ec);
    if (ec) {
        std::cerr << "Failed to create output directory: " << out_dir.string() << "\n";
        return 2;
    }

    // Determine project name if possible.
    std::optional<std::string> project_name;
    std::optional<std::string> project_version;
    std::optional<std::string> guix_version;
    std::optional<std::string> studio_version;

    if (project) {
        const auto header = parse_project_header(*project);
        project_name = header.project_name;
        project_version = header.project_version;
        guix_version = header.guix_version;
        studio_version = header.studio_version;
    }

    if (!project_name || project_name->empty()) {
        // Fall back to filename base.
        if (project) {
            project_name = std::filesystem::path(*project).stem().string();
        } else if (xml_in) {
            project_name = std::filesystem::path(*xml_in).stem().string();
        }
    }

    if (!project_name || project_name->empty()) {
        std::cerr << "Unable to determine project name\n";
        return 1;
    }

    // Phase 1 default behavior: if no specific outputs requested, behave like before and emit resource XML.
    const bool any_requested = (gen_resource || gen_specification || binary);

    // Validate selection filters (best-effort, only when a .gxp is provided).
    std::optional<std::string> selected_display_name;
    std::vector<std::string> selected_theme_names;
    std::vector<std::string> selected_language_names;
    studio_core::XmlParseResult parsed_gxp;
    bool have_parsed_gxp = false;
    const studio_core::XmlNode* selected_display = nullptr;
    std::vector<std::string> known_languages;
    if (project) {
        parsed_gxp = studio_core::parse_xml_file(*project);
        if (!parsed_gxp.ok) {
            std::cerr << parsed_gxp.error << "\n";
            return 1;
        }
        have_parsed_gxp = true;
        {
            auto mig = studio_core::migrate_gxp_to_latest(parsed_gxp.doc);
            if (!mig.ok) {
                warnings.push_back("Migration failed: " + mig.error);
            } else {
                for (const auto& w : mig.warnings) warnings.push_back(w);
            }
        }

        // Collect known languages.
        if (const auto* header = parsed_gxp.doc.root.firstChild("header")) {
            if (const auto* ln = header->firstChild("language_names")) {
                for (const auto& c : ln->children) {
                    if (c.name == "language" && !c.text.empty()) {
                        known_languages.push_back(c.text);
                    }
                }
            }
        }

        // Validate language filters.
        if (!language_filters.empty()) {
            for (const auto& l : language_filters) {
                bool found = false;
                for (const auto& k : known_languages) {
                    if (k == l) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    std::cerr << "Unknown language: " << l << "\n";
                    return 2;
                }
            }
            selected_language_names = language_filters;
        }

        // Collect displays and pick selected display.
        std::vector<std::string> known_displays;
        for (const auto* d : parsed_gxp.doc.root.childrenNamed("display_info")) {
            const auto dn = studio_core::node_text(*d, "display_name");
            if (dn && !dn->empty()) {
                known_displays.push_back(*dn);
            }
        }

        if (!display_filters.empty()) {
            // Phase 1: only one display is materialized in resource XML; use first.
            if (display_filters.size() > 1) {
                warnings.push_back("Phase 1: only one display is supported; using the first entry from --display");
            }
            selected_display_name = display_filters.front();

            for (const auto* d : parsed_gxp.doc.root.childrenNamed("display_info")) {
                const auto dn = studio_core::node_text(*d, "display_name");
                if (dn && *dn == *selected_display_name) {
                    selected_display = d;
                    break;
                }
            }
            if (!selected_display) {
                std::cerr << "Unknown display: " << *selected_display_name << "\n";
                return 2;
            }
        } else {
            // Default to display_index==0 like export_resource_xml.
            for (const auto* d : parsed_gxp.doc.root.childrenNamed("display_info")) {
                const auto idx = studio_core::node_int(*d, "display_index");
                if (idx && *idx == 0) {
                    selected_display = d;
                    const auto dn = studio_core::node_text(*d, "display_name");
                    if (dn && !dn->empty()) selected_display_name = *dn;
                    break;
                }
            }
            if (!selected_display) {
                selected_display = parsed_gxp.doc.root.firstChild("display_info");
                if (selected_display) {
                    const auto dn = studio_core::node_text(*selected_display, "display_name");
                    if (dn && !dn->empty()) selected_display_name = *dn;
                }
            }
        }

        // Validate themes within selected display.
        if (selected_display && !theme_filters.empty()) {
            std::vector<std::string> known_themes;
            if (const auto* ti = selected_display->firstChild("theme_info")) {
                for (const auto& c : ti->children) {
                    if (c.name == "theme_name" && !c.text.empty()) {
                        known_themes.push_back(c.text);
                    }
                }
            }

            for (const auto& t : theme_filters) {
                bool found = false;
                for (const auto& k : known_themes) {
                    if (k == t) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    std::cerr << "Unknown theme: " << t << "\n";
                    return 2;
                }
            }
            selected_theme_names = theme_filters;
        }
    }

    struct PlannedOutput {
        std::string kind;
        std::filesystem::path path;
    };
    std::vector<PlannedOutput> outputs;

    std::filesystem::path resource_xml_path;
    if (!xml_in) {
        // We need a resource XML (either explicitly requested or as input for binary generation, or for backward-compatible behavior).
        const std::filesystem::path out_file = out_dir / (*project_name + ".resource.xml");
        if (project) {
            studio_core::ResourceXmlExportOptions opts;
            if (selected_display_name) opts.display_name = *selected_display_name;
            opts.theme_names = selected_theme_names;

            const auto exported = studio_core::export_resource_xml_from_gxp(*project, out_file.string(), opts);
            if (!exported.ok) {
                std::cerr << exported.error << "\n";
                return 1;
            }
            for (const auto& w : exported.warnings) {
                warnings.push_back(w);
            }
        } else {
            // No .gxp available; fall back to a minimal resource XML.
            std::string err;
            studio_core::XmlWriter writer;
            if (!writer.openFile(out_file.string(), &err)) {
                std::cerr << err << "\n";
                return 2;
            }
            writer.writeHeader("GUIX_Studio_Resource");
            writer.openTag("resource_project");
            writer.openTag("header");
            writer.writeString("name", *project_name);
            writer.writeInt("version", kMinimumResourceXmlVersion);
            writer.writeString("converter", "GUIX Studio");
            writer.writeString("target_cpu", "Generic");
            writer.writeString("target_tools", "Generic");
            writer.writeBool("dave2d_graph_accelerator", false);
            writer.closeTag("header");
            writer.openTag("display_info");
            writer.writeString("display_color_format", "GX_COLOR_FORMAT_565RGB");
            writer.writeString("rotation_angle", "None");
            writer.closeTag("display_info");
            writer.closeTag("resource_project");
            writer.closeFile();
        }

        resource_xml_path = out_file;
    } else {
        // Validate the input is a resource project like legacy Studio.
        const auto rp = studio_core::parse_resource_project_header(*xml_in);
        if (!rp.ok) {
            std::cerr << rp.error << "\n";
            return 1;
        }
        if (!rp.header.version || *rp.header.version < kMinimumResourceXmlVersion) {
            std::cerr << "Invalid resource project version\n";
            return 1;
        }
        if (!rp.header.converter || *rp.header.converter != "GUIX Studio") {
            std::cerr << "Unknown converter\n";
            return 1;
        }
        resource_xml_path = std::filesystem::path(*xml_in);
    }

    // Back-compat: always report resource_xml when we created/used one.
    if (!resource_xml_path.empty()) {
        outputs.push_back({"resource_xml", resource_xml_path});
    }

    // Resource/spec outputs are legacy flags with optional base names.
    if (gen_resource) {
        const std::string base = resource_flag.value.value_or(*project_name + "_resources");
        std::filesystem::path p(base);
        if (p.is_relative()) {
            p = out_dir / p;
        }

        if (has_extension(p)) {
            outputs.push_back({"resource", p});
        } else {
            outputs.push_back({"resource_c", std::filesystem::path(p.string() + ".c")});
            outputs.push_back({"resource_h", std::filesystem::path(p.string() + ".h")});
        }
    } else if (!any_requested) {
        // If user didn't request anything, keep Phase 1 behavior (resource XML only).
    }

    if (gen_specification) {
        const std::string base = spec_flag.value.value_or(*project_name + "_specifications");
        std::filesystem::path p(base);
        if (p.is_relative()) {
            p = out_dir / p;
        }

        if (has_extension(p)) {
            outputs.push_back({"specification", p});
        } else {
            outputs.push_back({"specification_c", std::filesystem::path(p.string() + ".c")});
            outputs.push_back({"specification_h", std::filesystem::path(p.string() + ".h")});
        }
    }

    if (binary) {
        std::filesystem::path p = out_dir / (*project_name + ".bin");
        outputs.push_back({"binary", p});
    }

    // Emit stub files for requested outputs.
    for (const auto& o : outputs) {
        if (o.kind == "resource_xml") {
            continue; // already written or provided
        }
        std::ofstream f(o.path, std::ios::binary);
        if (!f) {
            std::cerr << "Unable to open output file: " << o.path.string() << "\n";
            return 2;
        }

        if (o.kind == "resource" || o.kind == "resource_c" || o.kind == "resource_h") {
            f << "/* Phase 1 stub: resource C output not implemented yet. */\n";
            f << "/* Project: " << *project_name << " */\n";
            f << "/* Generated from: " << (project ? *project : resource_xml_path.string()) << " */\n";
        } else if (o.kind == "specification" || o.kind == "specification_c" || o.kind == "specification_h") {
            f << "# Phase 1 stub: specification output not implemented yet\n";
            f << "project: " << *project_name << "\n";
        } else if (o.kind == "binary") {
            // Phase 2+ work: real Studio-parity binres generation.
            // For now, emit a minimal, loadable GUIX binres file so loaders/tools can consume it.
            //
            // NOTE: `--big_endian` is honored for integer serialization. Payload parity
            // (fonts/pixelmaps beyond headers) will be added incrementally.
            std::string err;
            const bool include_header = !no_res_header;

            // When generating a binary from resource XML, Studio expects pixelmap source
            // assets referenced by the resource project to exist on disk. Even though
            // this CLI currently falls back to a minimal binres in XML-input mode,
            // validate referenced pixelmap assets to keep error handling consistent.
            if (xml_in) {
                auto parsed = studio_core::parse_xml_file(resource_xml_path.string());
                if (!parsed.ok) {
                    std::cerr << parsed.error << "\n";
                    return 1;
                }

                const std::filesystem::path xml_dir = resource_xml_path.parent_path();
                const std::filesystem::path cwd = std::filesystem::current_path();

                auto normalize_path_text = [](std::string s) -> std::string {
                    std::replace(s.begin(), s.end(), '\\', '/');
                    return s;
                };

                auto resolve_existing_path = [&](const std::string& path_text) -> std::optional<std::filesystem::path> {
                    if (path_text.empty()) return std::nullopt;

                    std::filesystem::path p(normalize_path_text(path_text));
                    if (!p.is_relative()) {
                        if (std::filesystem::exists(p)) return p;
                        return std::nullopt;
                    }

                    if (xml_asset_base_dir) {
                        const auto cand = (*xml_asset_base_dir / p).lexically_normal();
                        if (std::filesystem::exists(cand)) return cand;
                    }
                    if (!xml_dir.empty()) {
                        const auto cand = (xml_dir / p).lexically_normal();
                        if (std::filesystem::exists(cand)) return cand;
                    }
                    if (!cwd.empty()) {
                        const auto cand = (cwd / p).lexically_normal();
                        if (std::filesystem::exists(cand)) return cand;
                    }
                    return std::nullopt;
                };

                auto best_effort_missing_path = [&](const std::string& path_text) -> std::filesystem::path {
                    std::filesystem::path p(normalize_path_text(path_text));
                    if (!p.is_relative()) return p;
                    if (xml_asset_base_dir) return (*xml_asset_base_dir / p).lexically_normal();
                    if (!cwd.empty()) return (cwd / p).lexically_normal();
                    if (!xml_dir.empty()) return (xml_dir / p).lexically_normal();
                    return p;
                };

                std::string fatal_asset_error;
                std::function<void(const studio_core::XmlNode&)> walk;
                walk = [&](const studio_core::XmlNode& n) {
                    if (!fatal_asset_error.empty()) return;

                    if (n.name == "resource") {
                        const auto* t = n.firstChild("type");
                        if (t && t->text == "PIXELMAP") {
                            std::string pathname;
                            std::string pathtype;
                            if (const auto* pi = n.firstChild("pathinfo")) {
                                if (const auto* pn = pi->firstChild("pathname")) pathname = pn->text;
                                if (const auto* pt = pi->firstChild("pathtype")) pathtype = pt->text;
                            }

                            // Default per exported XML.
                            if (pathtype.empty()) pathtype = "project_relative";

                            // For now, only validate file-backed pixelmaps where a pathname is provided.
                            if (!pathname.empty()) {
                                if (pathtype == "project_relative" || pathtype == "absolute") {
                                    if (!resolve_existing_path(pathname)) {
                                        fatal_asset_error = "Missing pixelmap source asset: " + best_effort_missing_path(pathname).string();
                                        if (std::filesystem::path(normalize_path_text(pathname)).is_relative() && !xml_asset_base_dir) {
                                            fatal_asset_error += "\nHint: run from the project directory or pass --project_dir <dir> to resolve project_relative assets.";
                                        }
                                        return;
                                    }
                                }
                            }
                        }
                    }

                    for (const auto& ch : n.children) {
                        walk(ch);
                        if (!fatal_asset_error.empty()) return;
                    }
                };

                walk(parsed.doc.root);
                if (!fatal_asset_error.empty()) {
                    std::cerr << fatal_asset_error << "\n";
                    return 1;
                }
            }

            bool wrote = false;
            if (have_parsed_gxp && selected_display) {
                // Determine theme IDs to include.
                std::vector<BinresThemeData> themes;
                {
                    struct ParsedTheme {
                        std::string name;
                        std::vector<uint32_t> colors;

                        // Per-theme font resources (ordered). Phase-1 emits these as default system fonts.
                        std::vector<uint8_t> font_bits;

                        struct ParsedPixelmap {
                            std::string name;
                            std::string pathname;
                            bool output_file_enabled = false;
                            bool binary_mode = false;
                            bool raw = false;
                        };

                        // Per-theme pixelmap resources (ordered).
                        std::vector<ParsedPixelmap> pixelmaps;

                        BinresThemeData::ScrollbarAppearance vscroll;
                        BinresThemeData::ScrollbarAppearance hscroll;
                        uint32_t vscroll_style = 0;
                        uint32_t hscroll_style = 0;

                        std::unordered_map<std::string, uint32_t> color_id_by_name;
                    };

                    auto normalize_id = [](std::string s) -> std::string {
                        std::transform(s.begin(), s.end(), s.begin(), [](unsigned char ch) {
                            return static_cast<char>(std::toupper(ch));
                        });
                        return s;
                    };

                    auto try_parse_u32 = [](const std::string& s, uint32_t* out) -> bool {
                        if (s.empty()) return false;
                        try {
                            size_t idx = 0;
                            const uint32_t v = static_cast<uint32_t>(std::stoul(s, &idx, 0));
                            if (idx != s.size()) return false;
                            *out = v;
                            return true;
                        } catch (...) {
                            return false;
                        }
                    };

                    auto try_parse_u16 = [&](const std::string& s, uint16_t* out) -> bool {
                        uint32_t tmp = 0;
                        if (!try_parse_u32(s, &tmp) || tmp > 0xFFFF) return false;
                        *out = static_cast<uint16_t>(tmp);
                        return true;
                    };

                    auto try_parse_u8 = [&](const std::string& s, uint8_t* out) -> bool {
                        uint32_t tmp = 0;
                        if (!try_parse_u32(s, &tmp) || tmp > 0xFF) return false;
                        *out = static_cast<uint8_t>(tmp);
                        return true;
                    };

                    auto resolve_color_id = [&](const ParsedTheme& theme, const std::string& maybe_name) -> uint32_t {
                        if (maybe_name.empty()) return 0;
                        uint32_t v = 0;
                        if (try_parse_u32(maybe_name, &v)) return v;
                        std::string key = normalize_id(maybe_name);
                        const std::string prefix = "GX_COLOR_ID_";
                        if (key.rfind(prefix, 0) == 0) {
                            key = key.substr(prefix.size());
                        }
                        const auto it = theme.color_id_by_name.find(key);
                        if (it != theme.color_id_by_name.end()) return it->second;
                        return 0;
                    };

                    auto parse_scroll_appearance = [&](const studio_core::XmlNode& node,
                                                      ParsedTheme& theme,
                                                      bool is_vertical) {
                        BinresThemeData::ScrollbarAppearance& a = is_vertical ? theme.vscroll : theme.hscroll;

                        if (const auto* n = node.firstChild("scroll_width")) {
                            (void)try_parse_u16(n->text, &a.scroll_width);
                        }
                        if (const auto* n = node.firstChild("thumb_width")) {
                            (void)try_parse_u16(n->text, &a.thumb_width);
                        }
                        if (const auto* n = node.firstChild("thumb_travel_min")) {
                            (void)try_parse_u16(n->text, &a.thumb_travel_min);
                        }
                        if (const auto* n = node.firstChild("thumb_travel_max")) {
                            (void)try_parse_u16(n->text, &a.thumb_travel_max);
                        }
                        if (const auto* n = node.firstChild("thumb_border_style")) {
                            (void)try_parse_u8(n->text, &a.thumb_border_style);
                        }

                        // Pixelmap IDs: leave as 0 for now unless specified numerically.
                        if (const auto* n = node.firstChild("scroll_fill_pixelmap")) {
                            (void)try_parse_u32(n->text, &a.scroll_fill_pixelmap);
                        }
                        if (const auto* n = node.firstChild("scroll_thumb_pixelmap")) {
                            (void)try_parse_u32(n->text, &a.scroll_thumb_pixelmap);
                        }
                        if (const auto* n = node.firstChild("scroll_up_pixelmap")) {
                            (void)try_parse_u32(n->text, &a.scroll_up_pixelmap);
                        }
                        if (const auto* n = node.firstChild("scroll_down_pixelmap")) {
                            (void)try_parse_u32(n->text, &a.scroll_down_pixelmap);
                        }

                        if (const auto* n = node.firstChild("scroll_thumb_color")) {
                            a.scroll_thumb_color = resolve_color_id(theme, n->text);
                        }
                        if (const auto* n = node.firstChild("scroll_thumb_border_color")) {
                            a.scroll_thumb_border_color = resolve_color_id(theme, n->text);
                        }
                        if (const auto* n = node.firstChild("scroll_button_color")) {
                            a.scroll_button_color = resolve_color_id(theme, n->text);
                        }

                        if (const auto* n = node.firstChild("scroll_style")) {
                            uint32_t style = 0;
                            if (try_parse_u32(n->text, &style)) {
                                if (is_vertical) {
                                    theme.vscroll_style = style;
                                } else {
                                    theme.hscroll_style = style;
                                }
                            }
                        }
                    };

                    std::vector<ParsedTheme> known_themes;
                    if (const auto* ti = selected_display->firstChild("theme_info")) {
                        ParsedTheme* current = nullptr;
                        for (const auto& c : ti->children) {
                            if (c.name == "theme_name" && !c.text.empty()) {
                                ParsedTheme t;
                                t.name = c.text;
                                known_themes.push_back(std::move(t));
                                current = &known_themes.back();
                                continue;
                            }

                            if (c.name == "theme_data" && current) {
                                // Recursively collect <resource> nodes with <type>COLOR</type>, <type>FONT</type>, and <type>PIXELMAP</type>.
                                std::function<void(const studio_core::XmlNode&)> walk;
                                walk = [&](const studio_core::XmlNode& n) {
                                    if (n.name == "resource") {
                                        const auto* t = n.firstChild("type");
                                        if (t && t->text == "COLOR") {
                                            const auto* enabled = n.firstChild("enabled");
                                            if (enabled && !enabled->text.empty()) {
                                                std::string e = enabled->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                if (e != "TRUE") {
                                                    // skip disabled colors
                                                    return;
                                                }
                                            }
                                            const auto* cv = n.firstChild("colorval");
                                            if (cv && !cv->text.empty()) {
                                                try {
                                                    const uint32_t v = static_cast<uint32_t>(std::stoul(cv->text));
                                                    current->colors.push_back(v);

                                                    if (const auto* nm = n.firstChild("name")) {
                                                        if (!nm->text.empty()) {
                                                            const std::string key = normalize_id(nm->text);
                                                            // Resource IDs are table indices.
                                                            const uint32_t color_id = static_cast<uint32_t>(current->colors.size() - 1);
                                                            current->color_id_by_name.emplace(key, color_id);
                                                        }
                                                    }
                                                } catch (...) {
                                                }
                                            }
                                        }
                                        if (t && t->text == "FONT") {
                                            const auto* enabled = n.firstChild("enabled");
                                            if (enabled && !enabled->text.empty()) {
                                                std::string e = enabled->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                if (e != "TRUE") {
                                                    // skip disabled fonts
                                                    return;
                                                }
                                            }

                                            uint8_t bits = 8;
                                            if (const auto* fb = n.firstChild("font_bits")) {
                                                uint32_t tmp = 0;
                                                if (try_parse_u32(fb->text, &tmp) && tmp <= 0xFF) {
                                                    bits = static_cast<uint8_t>(tmp);
                                                }
                                            }
                                            current->font_bits.push_back(bits);
                                        }

                                        if (t && t->text == "PIXELMAP") {
                                            const auto* enabled = n.firstChild("enabled");
                                            if (enabled && !enabled->text.empty()) {
                                                std::string e = enabled->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                if (e != "TRUE") {
                                                    // skip disabled pixelmaps
                                                    return;
                                                }
                                            }

                                            ParsedTheme::ParsedPixelmap pm;
                                            if (const auto* nm = n.firstChild("name")) {
                                                pm.name = nm->text;
                                            }
                                            if (const auto* pi = n.firstChild("pathinfo")) {
                                                if (const auto* pn = pi->firstChild("pathname")) {
                                                    pm.pathname = pn->text;
                                                }
                                            }

                                            if (const auto* ofe = n.firstChild("output_file_enabled")) {
                                                std::string e = ofe->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                pm.output_file_enabled = (e == "TRUE");
                                            }
                                            if (const auto* bm = n.firstChild("binary_mode")) {
                                                std::string e = bm->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                pm.binary_mode = (e == "TRUE");
                                            }
                                            if (const auto* rw = n.firstChild("raw")) {
                                                std::string e = rw->text;
                                                std::transform(e.begin(), e.end(), e.begin(), [](unsigned char ch) { return static_cast<char>(std::toupper(ch)); });
                                                pm.raw = (e == "TRUE");
                                            }

                                            current->pixelmaps.push_back(std::move(pm));
                                        }
                                    } else if (n.name == "vscroll_appearance" && current) {
                                        parse_scroll_appearance(n, *current, true);
                                    } else if (n.name == "hscroll_appearance" && current) {
                                        parse_scroll_appearance(n, *current, false);
                                    }
                                    for (const auto& ch : n.children) {
                                        walk(ch);
                                    }
                                };

                                walk(c);
                            }
                        }
                    }

                    std::vector<std::string> selected_themes;
                    if (!selected_theme_names.empty()) {
                        selected_themes = selected_theme_names;
                    } else {
                        for (const auto& t : known_themes) {
                            selected_themes.push_back(t.name);
                        }
                    }

                    for (const auto& name : selected_themes) {
                        for (size_t i = 0; i < known_themes.size(); ++i) {
                            if (known_themes[i].name == name) {
                                BinresThemeData td;
                                td.theme_id = static_cast<uint16_t>(i);
                                td.colors = known_themes[i].colors;

                                td.fonts.reserve(known_themes[i].font_bits.size());
                                for (size_t fi = 0; fi < known_themes[i].font_bits.size(); ++fi) {
                                    BinresThemeData::FontEntry fe;
                                    fe.index = static_cast<uint16_t>(fi);
                                    fe.bits = known_themes[i].font_bits[fi];
                                    fe.is_default = true; // Phase-1: keep binres loadable without embedding glyph data.
                                    td.fonts.push_back(fe);
                                }

                                td.pixelmaps.reserve(known_themes[i].pixelmaps.size());
                                const std::filesystem::path project_dir = std::filesystem::path(*project).parent_path();
                                for (size_t pi = 0; pi < known_themes[i].pixelmaps.size(); ++pi) {
                                    const auto& src = known_themes[i].pixelmaps[pi];
                                    BinresThemeData::PixelmapEntry pm;
                                    pm.index = static_cast<uint16_t>(pi + 1); // pixelmap IDs start at 1
                                    pm.format = 22; // GX_COLOR_FORMAT_32ARGB
                                    pm.output_file_enabled = src.output_file_enabled;
                                    pm.binary_mode = src.binary_mode;
                                    pm.raw = src.raw;

                                    if (!src.pathname.empty()) {
                                        std::string normalized = src.pathname;
                                        std::replace(normalized.begin(), normalized.end(), '\\', '/');
                                        std::filesystem::path rel(normalized);
                                        if (rel.is_relative()) {
                                            pm.source_path = (project_dir / rel);
                                        } else {
                                            pm.source_path = rel;
                                        }
                                    }
                                    td.pixelmaps.push_back(std::move(pm));
                                }

                                td.vscroll = known_themes[i].vscroll;
                                td.hscroll = known_themes[i].hscroll;
                                td.vscroll_style = known_themes[i].vscroll_style;
                                td.hscroll_style = known_themes[i].hscroll_style;
                                themes.push_back(std::move(td));
                                break;
                            }
                        }
                    }

                    if (themes.empty()) {
                        themes.push_back(BinresThemeData{});
                    }
                }

                // Determine enabled languages for this display (in header language order).
                std::vector<std::string> enabled_languages;
                for (const auto& lang : known_languages) {
                    const auto enabled = studio_core::node_bool(*selected_display, lang.c_str());
                    if (enabled && *enabled) enabled_languages.push_back(lang);
                }
                if (enabled_languages.empty()) {
                    enabled_languages = known_languages;
                }

                std::vector<std::string> selected_languages;
                if (!selected_language_names.empty()) {
                    selected_languages = selected_language_names;
                } else {
                    selected_languages = enabled_languages;
                }

                const auto* st = selected_display->firstChild("string_table");
                if (st && !selected_languages.empty()) {
                    const auto ns = studio_core::node_int(*st, "num_strings");
                    const auto records = st->childrenNamed("string_record");

                    const uint16_t string_count = (ns && *ns > 0)
                        ? static_cast<uint16_t>(*ns)
                        : static_cast<uint16_t>(records.size() + 1);

                    if (string_count >= 1) {
                        BinresStringTable tbl;
                        tbl.language_names = selected_languages;
                        tbl.string_count = string_count;
                        tbl.strings.resize(tbl.language_names.size());
                        for (auto& vec : tbl.strings) {
                            vec.resize(string_count);
                        }

                        // Map each selected language to its position in the display's enabled language list.
                        std::vector<int> selected_lang_to_enabled_index;
                        selected_lang_to_enabled_index.reserve(selected_languages.size());
                        for (const auto& sel_lang : selected_languages) {
                            int idx = -1;
                            for (size_t i = 0; i < enabled_languages.size(); ++i) {
                                if (enabled_languages[i] == sel_lang) {
                                    idx = static_cast<int>(i);
                                    break;
                                }
                            }
                            selected_lang_to_enabled_index.push_back(idx);
                        }

                        // Fill strings. Record order defines string indices.
                        const size_t max_records = std::min(records.size(), static_cast<size_t>(string_count > 0 ? string_count - 1 : 0));
                        for (size_t ri = 0; ri < max_records; ++ri) {
                            const auto* rec = records[ri];
                            if (!rec) continue;

                            const auto vals = rec->childrenNamed("val");
                            const uint16_t string_index = static_cast<uint16_t>(ri + 1);

                            for (size_t li = 0; li < selected_languages.size(); ++li) {
                                const int enabled_idx = selected_lang_to_enabled_index[li];
                                if (enabled_idx < 0) {
                                    continue;
                                }
                                const size_t ei = static_cast<size_t>(enabled_idx);
                                if (ei < vals.size() && vals[ei] && !vals[ei]->text.empty()) {
                                    tbl.strings[li][string_index] = vals[ei]->text;
                                }
                            }
                        }

                        wrote = write_binres_with_strings(f, include_header, big_endian, themes, tbl, &err);
                        if (!wrote && !err.empty()) {
                            std::cerr << err << "\n";
                            return 1;
                        }
                    }
                }
            } else if (xml_in) {
                // Resource-XML input mode: build a minimal theme from <resource> entries.
                // This is intentionally small-scope (pixelmaps + basic font list) but
                // produces a loadable binres and exercises the same writer.

                auto parsed = studio_core::parse_xml_file(resource_xml_path.string());
                if (!parsed.ok) {
                    std::cerr << parsed.error << "\n";
                    return 1;
                }

                const std::filesystem::path xml_dir = resource_xml_path.parent_path();
                const std::filesystem::path cwd = std::filesystem::current_path();

                auto normalize_path_text = [](std::string s) -> std::string {
                    std::replace(s.begin(), s.end(), '\\', '/');
                    return s;
                };

                auto resolve_resource_xml_path = [&](const std::string& path_text) -> std::filesystem::path {
                    std::filesystem::path p(normalize_path_text(path_text));
                    if (!p.is_relative()) return p;
                    if (xml_asset_base_dir) return (*xml_asset_base_dir / p).lexically_normal();
                    if (!cwd.empty()) return (cwd / p).lexically_normal();
                    if (!xml_dir.empty()) return (xml_dir / p).lexically_normal();
                    return p;
                };

                BinresThemeData td;
                td.theme_id = 0;

                uint16_t next_pixelmap_id = 1;
                uint16_t next_font_id = 0;

                std::function<void(const studio_core::XmlNode&)> walk;
                walk = [&](const studio_core::XmlNode& n) {
                    if (n.name == "resource") {
                        const auto type = studio_core::node_text(n, "type");
                        if (type && *type == "PIXELMAP") {
                            std::string pathname;
                            if (const auto* pi = n.firstChild("pathinfo")) {
                                if (const auto* pn = pi->firstChild("pathname")) {
                                    pathname = pn->text;
                                }
                            }

                            BinresThemeData::PixelmapEntry pm;
                            pm.index = next_pixelmap_id++; // pixelmap IDs start at 1
                            pm.format = 22; // GX_COLOR_FORMAT_32ARGB

                            if (!pathname.empty()) {
                                pm.source_path = resolve_resource_xml_path(pathname);
                                // In XML mode, a pixelmap pathname implies we should embed it.
                                pm.output_file_enabled = true;
                                pm.binary_mode = true;
                            }

                            if (const auto raw = studio_core::node_bool(n, "raw")) {
                                pm.raw = *raw;
                            }

                            td.pixelmaps.push_back(std::move(pm));
                        } else if (type && *type == "FONT") {
                            BinresThemeData::FontEntry fe;
                            fe.index = next_font_id++;
                            fe.is_default = true;
                            fe.bits = 8;
                            if (const auto fb = studio_core::node_int(n, "font_bits")) {
                                if (*fb >= 0 && *fb <= 0xFF) {
                                    fe.bits = static_cast<uint8_t>(*fb);
                                }
                            }
                            td.fonts.push_back(fe);
                        }
                    }

                    for (const auto& ch : n.children) {
                        walk(ch);
                    }
                };
                walk(parsed.doc.root);

                // Dummy string table (loadable, but empty): 1 language, reserved index 0 only.
                BinresStringTable tbl;
                tbl.language_names = {"EN"};
                tbl.string_count = 1;
                tbl.strings.resize(1);
                tbl.strings[0].resize(1);

                wrote = write_binres_with_strings(f, include_header, big_endian, {td}, tbl, &err);
                if (!wrote && !err.empty()) {
                    std::cerr << err << "\n";
                    return 1;
                }
            }

            if (!wrote) {
                if (!err.empty()) {
                    warnings.push_back("Binary generation fallback: " + err);
                }
                err.clear();
                if (!write_minimal_binres(f, include_header, big_endian, &err)) {
                    std::cerr << err << "\n";
                    return 1;
                }
            }
        }
    }

    if (json) {
        std::cout << "{\"ok\":true";
        std::cout << ",\"project_name\":\"" << json_escape(*project_name) << "\"";
        if (!resource_xml_path.empty()) {
            std::cout << ",\"resource_xml\":\"" << json_escape(resource_xml_path.string()) << "\"";
        }

        std::cout << ",\"filters\":{";
        auto emit_list = [&](const char* key, const std::vector<std::string>& vals) {
            std::cout << "\"" << key << "\":[";
            for (size_t i = 0; i < vals.size(); ++i) {
                if (i) std::cout << ",";
                std::cout << "\"" << json_escape(vals[i]) << "\"";
            }
            std::cout << "]";
        };
        emit_list("display", display_filters);
        std::cout << ",";
        emit_list("theme", theme_filters);
        std::cout << ",";
        emit_list("language", language_filters);
        std::cout << "}";

        std::cout << ",\"warnings\":[";
        for (size_t i = 0; i < warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(warnings[i]) << "\"";
        }
        std::cout << "]";

        std::cout << ",\"outputs\":[";
        for (size_t i = 0; i < outputs.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "{\"kind\":\"" << json_escape(outputs[i].kind) << "\",\"path\":\"";
            std::cout << json_escape(outputs[i].path.string()) << "\"}";
        }
        std::cout << "]}";
        std::cout << "\n";
        return 0;
    }

    for (const auto& o : outputs) {
        std::cout << "Wrote " << o.kind << ": " << o.path.string() << "\n";
    }
    return 0;
}

int cmd_summary(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const auto header = parse_project_header(*project);
    const bool json = has_flag(args, "--json");

    if (json) {
        auto j = [&](const char* key, const std::optional<std::string>& val) {
            if (!val) {
                std::cout << "\"" << key << "\":null";
            } else {
                std::cout << "\"" << key << "\":\"" << json_escape(*val) << "\"";
            }
        };

        std::cout << "{";
        j("project", *project);
        std::cout << ",";
        j("project_version", header.project_version);
        std::cout << ",";
        j("guix_version", header.guix_version);
        std::cout << ",";
        j("studio_version", header.studio_version);
        std::cout << ",";
        j("project_name", header.project_name);
        std::cout << "}\n";
        return 0;
    }

    std::cout << "Project: " << *project << "\n";
    std::cout << "  project_name: " << (header.project_name ? *header.project_name : "<missing>") << "\n";
    std::cout << "  project_version: " << (header.project_version ? *header.project_version : "<missing>") << "\n";
    std::cout << "  guix_version: " << (header.guix_version ? *header.guix_version : "<missing>") << "\n";
    std::cout << "  studio_version: " << (header.studio_version ? *header.studio_version : "<missing>") << "\n";
    return 0;
}

int cmd_validate(const std::vector<std::string>& args) {
    const auto project = arg_value_any(args, {"--project", "-p"});
    if (!project) {
        std::cerr << "Missing required flag: --project/-p\n";
        return 2;
    }

    const bool json = has_flag(args, "--json");

    auto emit_json = [&](bool ok, const std::vector<std::string>& errors, const std::vector<std::string>& warnings) {
        std::cout << "{\"ok\":" << (ok ? "true" : "false") << ",\"errors\":[";
        for (size_t i = 0; i < errors.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(errors[i]) << "\"";
        }
        std::cout << "],\"warnings\":[";
        for (size_t i = 0; i < warnings.size(); ++i) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(warnings[i]) << "\"";
        }
        std::cout << "]}\n";
    };

    // Small but real validation: parse XML, check basic schema shape, and
    // preview in-memory migration to latest (explicit on-disk migration is a
    // separate command).
    std::vector<std::string> errors;
    std::vector<std::string> warnings;

    auto parsed = studio_core::parse_xml_file(*project);
    if (!parsed.ok) {
        errors.emplace_back(parsed.error);
    } else {
        if (parsed.doc.doctype.find("GUIX_Studio_Project") == std::string::npos) {
            errors.emplace_back("Not a GUIX_Studio_Project (.gxp) file (missing/unknown doctype)");
        }

        if (parsed.doc.root.name != "project") {
            errors.emplace_back("Root element is not <project>");
        } else {
            const auto* header_node = parsed.doc.root.firstChild("header");
            if (!header_node) {
                errors.emplace_back("Missing <header>");
            } else {
                const auto project_name = studio_core::node_text(*header_node, "project_name");
                if (!project_name || project_name->empty()) {
                    errors.emplace_back("Missing <project_name>");
                }

                const auto project_version = studio_core::node_text(*header_node, "project_version");
                std::optional<int> project_version_int;
                if (!project_version || project_version->empty()) {
                    errors.emplace_back("Missing <project_version>");
                } else {
                    project_version_int = parse_int(project_version);
                    if (!project_version_int) {
                        warnings.emplace_back("Non-integer <project_version>");
                    } else if (*project_version_int < studio_core::kLatestProjectVersion) {
                        warnings.emplace_back("Project version is older than latest; run 'migrate' to update on disk");
                    }
                }

                const auto guix_version = studio_core::node_text(*header_node, "guix_version");
                if (guix_version && !guix_version->empty() && !parse_int(guix_version)) {
                    warnings.emplace_back("Non-integer <guix_version>");
                }

                const auto studio_version = studio_core::node_text(*header_node, "studio_version");
                if (studio_version && !studio_version->empty() && !parse_int(studio_version)) {
                    warnings.emplace_back("Non-integer <studio_version>");
                }

                // Preview migration (in-memory only) to surface concrete schema rewrites.
                auto mig = studio_core::migrate_gxp_to_latest(parsed.doc);
                if (!mig.ok) {
                    warnings.emplace_back("Migration preview failed: " + mig.error);
                } else {
                    for (const auto& w : mig.warnings) {
                        warnings.push_back("Migration: " + w);
                    }
                    for (const auto& c : mig.changes) {
                        warnings.push_back("Migration change: " + c);
                    }
                }
            }
        }
    }

    const bool ok = errors.empty();

    if (json) {
        emit_json(ok, errors, warnings);
    } else {
        for (const auto& e : errors) {
            std::cerr << e << "\n";
        }
        for (const auto& w : warnings) {
            std::cerr << "Warning: " << w << "\n";
        }
    }

    return ok ? 0 : 1;
}

} // namespace

int main(int argc, char** argv) {
    std::vector<std::string> args;
    args.reserve(static_cast<size_t>(argc));
    for (int i = 1; i < argc; i++) {
        args.emplace_back(argv[i]);
    }

    if (args.empty() || args[0] == "help" || args[0] == "--help" || args[0] == "-h") {
        print_usage(std::cout);
        return 0;
    }

    if (args[0] == "--version" || args[0] == "version") {
        std::cout << kVersion << "\n";
        return 0;
    }

    const auto command = args[0];
    const std::vector<std::string> rest(args.begin() + 1, args.end());

    if (command == "summary") {
        return cmd_summary(rest);
    }

    if (command == "validate") {
        return cmd_validate(rest);
    }

    if (command == "migrate") {
        return cmd_migrate(rest);
    }

    if (command == "format-gxp") {
        return cmd_format_gxp(rest);
    }

    if (command == "export-resource-xml") {
        return cmd_export_resource_xml(rest);
    }

    if (command == "binres-inspect") {
        return cmd_binres_inspect(rest);
    }

    if (command == "generate") {
        return cmd_generate(rest);
    }

    if (command == "export-strings") {
        return cmd_export_strings(rest);
    }

    if (command == "import-strings") {
        return cmd_import_strings(rest);
    }

    if (command == "export-xliff") {
        return cmd_export_xliff(rest);
    }

    if (command == "import-xliff") {
        return cmd_import_xliff(rest);
    }

    std::cerr << "Unknown command: " << command << "\n\n";
    print_usage(std::cerr);
    return 2;
}
