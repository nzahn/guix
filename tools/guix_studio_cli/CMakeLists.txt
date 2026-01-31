cmake_minimum_required(VERSION 3.16)

project(guix_studio_cli LANGUAGES CXX)

add_executable(guix_studio_cli
    src/main.cpp
)

target_compile_features(guix_studio_cli PRIVATE cxx_std_17)

# Keep warnings reasonable across compilers.
if (MSVC)
  target_compile_options(guix_studio_cli PRIVATE /W4)
else()
  target_compile_options(guix_studio_cli PRIVATE -Wall -Wextra -Wpedantic)
endif()
