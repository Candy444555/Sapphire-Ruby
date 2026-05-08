# CMakeLists.txt for the curl-impersonate JNI bridge.
#
# Built by gradle's externalNativeBuild during `./gradlew assembleRelease`.
# Produces libcurl-impersonate-jni.so, which is loaded at runtime by
# LexiCurlImpersonateModule.kt via System.loadLibrary("curl-impersonate-jni").
#
# Linker dt_NEEDED-pulls libcurl-impersonate.so (placed under
# jniLibs/arm64-v8a/ by with-stealth-native-sources.js / with-curl-impersonate.js).
# Android's PackageManager auto-extracts both .so files at install time.

cmake_minimum_required(VERSION 3.18.1)
project(curl_impersonate_jni LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Where the prebuilt libcurl-impersonate.so lives, per ABI.
# CMAKE_ANDROID_ARCH_ABI is set by gradle's externalNativeBuild for each ABI.
set(LEXI_JNI_LIBS_DIR ${CMAKE_SOURCE_DIR}/../jniLibs)

# Import the prebuilt libcurl-impersonate as a SHARED IMPORTED target so we
# can dt_NEEDED-link against its SONAME.
add_library(curl-impersonate SHARED IMPORTED)
set_target_properties(curl-impersonate PROPERTIES
    IMPORTED_LOCATION ${LEXI_JNI_LIBS_DIR}/${CMAKE_ANDROID_ARCH_ABI}/libcurl-impersonate.so)

# Our JNI bridge.
add_library(curl-impersonate-jni SHARED
    curl_impersonate_jni.c
    cJSON.c)

target_include_directories(curl-impersonate-jni PRIVATE
    ${LEXI_JNI_LIBS_DIR}/include)

# Hide all but the JNI entry-point symbols to keep the .so small and clean.
set_target_properties(curl-impersonate-jni PROPERTIES
    C_VISIBILITY_PRESET hidden)

target_compile_options(curl-impersonate-jni PRIVATE
    -fvisibility=hidden -O2 -Wall -Wno-unused-parameter)

# Standard Android system libs + log + the prebuilt libcurl-impersonate.
find_library(log-lib log)
target_link_libraries(curl-impersonate-jni
    curl-impersonate
    ${log-lib})
