/*
 * curl_impersonate_jni.c
 *
 * JNI bridge that exposes libcurl-impersonate to LexiCurlImpersonateModule.kt.
 *
 * Compiled by gradle's externalNativeBuild (CMake) into
 * libcurl-impersonate-jni.so, which dt_NEEDED-links against the prebuilt
 * libcurl-impersonate.so dropped under jniLibs/arm64-v8a/. The Android linker
 * resolves both at System.loadLibrary("curl-impersonate-jni") time.
 *
 * Native entry points (called from LexiCurlImpersonateModule):
 *   - Java_com_lexi_stealth_LexiCurlImpersonateModule_nativeRequest(JNIEnv*, jobject, jstring opts_json) -> jstring result_json
 *   - Java_com_lexi_stealth_LexiCurlImpersonateModule_nativeListImpersonations(JNIEnv*, jobject) -> jstring json_array
 *
 * Input JSON shape (from Kotlin):
 *   {
 *     "url": "https://...",
 *     "method": "GET" | "POST" | ...,
 *     "headers": [["Name","Value"], ...],
 *     "body": "..." | null,
 *     "socksProxy": "socks5h://127.0.0.1:9050" | null,
 *     "httpProxy": "http://user:pass@host:port" | null,
 *     "impersonate": "chrome124"
 *   }
 *
 * Output JSON shape:
 *   {
 *     "status": <int>,
 *     "headers": [["Name","Value"], ...],
 *     "bodyBase64": "<base64>"
 *   }
 *
 * Errors are returned as: { "status": 0, "headers": [], "bodyBase64": "", "error": "<msg>" }
 * The Kotlin caller maps "error" to a promise rejection.
 */

#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <android/log.h>

#include "curl/curl.h"
#include "curl/easy.h"
#include "curl/curl-impersonate.h"

#include "cJSON.h"

#define TAG "LexiCurlJNI"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

/* --- response sink --------------------------------------------------------*/

typedef struct {
    char *data;
    size_t len;
    size_t cap;
} sink_t;

static int sink_append(sink_t *s, const char *p, size_t n) {
    if (s->len + n + 1 > s->cap) {
        size_t nc = s->cap ? s->cap : 4096;
        while (nc < s->len + n + 1) nc *= 2;
        char *nd = (char *)realloc(s->data, nc);
        if (!nd) return 0;
        s->data = nd;
        s->cap = nc;
    }
    memcpy(s->data + s->len, p, n);
    s->len += n;
    s->data[s->len] = '\0';
    return 1;
}

static size_t write_body_cb(char *ptr, size_t size, size_t nmemb, void *ud) {
    sink_t *s = (sink_t *)ud;
    if (!sink_append(s, ptr, size * nmemb)) return 0;
    return size * nmemb;
}

/* response headers come in line-by-line */
typedef struct {
    cJSON *arr; /* JSON array of [name,value] pairs */
} hdr_sink_t;

static size_t write_header_cb(char *buf, size_t size, size_t nmemb, void *ud) {
    hdr_sink_t *h = (hdr_sink_t *)ud;
    size_t total = size * nmemb;
    /* skip status line and the trailing blank line */
    if (total < 2) return total;
    /* find ":" */
    size_t i = 0;
    while (i < total && buf[i] != ':' && buf[i] != '\r' && buf[i] != '\n') i++;
    if (i == 0 || i >= total || buf[i] != ':') return total;
    /* trim header value */
    size_t v = i + 1;
    while (v < total && (buf[v] == ' ' || buf[v] == '\t')) v++;
    size_t end = total;
    while (end > v && (buf[end - 1] == '\r' || buf[end - 1] == '\n')) end--;
    char *name = (char *)malloc(i + 1);
    char *val = (char *)malloc(end - v + 1);
    if (!name || !val) { free(name); free(val); return total; }
    memcpy(name, buf, i); name[i] = '\0';
    memcpy(val, buf + v, end - v); val[end - v] = '\0';
    cJSON *pair = cJSON_CreateArray();
    cJSON_AddItemToArray(pair, cJSON_CreateString(name));
    cJSON_AddItemToArray(pair, cJSON_CreateString(val));
    cJSON_AddItemToArray(h->arr, pair);
    free(name);
    free(val);
    return total;
}

/* --- base64 encoder -------------------------------------------------------*/

static const char b64chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *b64_encode(const unsigned char *src, size_t len) {
    size_t olen = 4 * ((len + 2) / 3);
    char *out = (char *)malloc(olen + 1);
    if (!out) return NULL;
    size_t i, j;
    for (i = 0, j = 0; i + 2 < len; i += 3) {
        out[j++] = b64chars[(src[i] >> 2) & 0x3F];
        out[j++] = b64chars[((src[i] & 0x3) << 4) | ((src[i + 1] >> 4) & 0xF)];
        out[j++] = b64chars[((src[i + 1] & 0xF) << 2) | ((src[i + 2] >> 6) & 0x3)];
        out[j++] = b64chars[src[i + 2] & 0x3F];
    }
    if (i < len) {
        out[j++] = b64chars[(src[i] >> 2) & 0x3F];
        if (i + 1 == len) {
            out[j++] = b64chars[(src[i] & 0x3) << 4];
            out[j++] = '=';
        } else {
            out[j++] = b64chars[((src[i] & 0x3) << 4) | ((src[i + 1] >> 4) & 0xF)];
            out[j++] = b64chars[(src[i + 1] & 0xF) << 2];
        }
        out[j++] = '=';
    }
    out[j] = '\0';
    return out;
}

/* --- helpers --------------------------------------------------------------*/

static jstring make_jstring(JNIEnv *env, cJSON *obj) {
    char *s = cJSON_PrintUnformatted(obj);
    jstring r = (*env)->NewStringUTF(env, s ? s : "{}");
    if (s) free(s);
    return r;
}

static jstring make_error(JNIEnv *env, const char *msg) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "status", 0);
    cJSON_AddItemToObject(root, "headers", cJSON_CreateArray());
    cJSON_AddStringToObject(root, "bodyBase64", "");
    cJSON_AddStringToObject(root, "error", msg);
    jstring out = make_jstring(env, root);
    cJSON_Delete(root);
    return out;
}

/* --- JNI entry points -----------------------------------------------------*/

JNIEXPORT jstring JNICALL
Java_com_lexi_stealth_LexiCurlImpersonateModule_nativeRequest(
    JNIEnv *env, jobject thiz, jstring opts_json) {

    const char *raw = (*env)->GetStringUTFChars(env, opts_json, NULL);
    if (!raw) return make_error(env, "GetStringUTFChars failed");

    cJSON *opts = cJSON_Parse(raw);
    (*env)->ReleaseStringUTFChars(env, opts_json, raw);
    if (!opts) return make_error(env, "input JSON parse failed");

    const cJSON *url_j = cJSON_GetObjectItemCaseSensitive(opts, "url");
    const cJSON *method_j = cJSON_GetObjectItemCaseSensitive(opts, "method");
    const cJSON *headers_j = cJSON_GetObjectItemCaseSensitive(opts, "headers");
    const cJSON *body_j = cJSON_GetObjectItemCaseSensitive(opts, "body");
    const cJSON *socks_j = cJSON_GetObjectItemCaseSensitive(opts, "socksProxy");
    const cJSON *http_proxy_j = cJSON_GetObjectItemCaseSensitive(opts, "httpProxy");
    const cJSON *imp_j = cJSON_GetObjectItemCaseSensitive(opts, "impersonate");

    if (!cJSON_IsString(url_j) || !url_j->valuestring) {
        cJSON_Delete(opts);
        return make_error(env, "missing url");
    }

    CURL *curl = curl_easy_init();
    if (!curl) { cJSON_Delete(opts); return make_error(env, "curl_easy_init failed"); }

    /* impersonate target — must be set BEFORE other TLS options so the
     * libcurl-impersonate fork's preset overrides our TLS knobs cleanly. */
    const char *target = (cJSON_IsString(imp_j) && imp_j->valuestring) ? imp_j->valuestring : "chrome124";
    CURLcode ic = curl_easy_impersonate(curl, target, 1 /* default_headers */);
    if (ic != CURLE_OK) {
        char msg[256];
        snprintf(msg, sizeof(msg), "curl_easy_impersonate(%s) failed: %s", target, curl_easy_strerror(ic));
        curl_easy_cleanup(curl);
        cJSON_Delete(opts);
        return make_error(env, msg);
    }

    curl_easy_setopt(curl, CURLOPT_URL, url_j->valuestring);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 10L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 30L);
    /* Trust system CA store on Android. NDK-bundled curl uses
     * /system/etc/security/cacerts/ by default; we leave CAINFO/CAPATH
     * unset so curl falls back to the system store. */

    const char *method = (cJSON_IsString(method_j) && method_j->valuestring) ? method_j->valuestring : "GET";
    if (strcmp(method, "GET") == 0) {
        curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    } else if (strcmp(method, "HEAD") == 0) {
        curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
    } else if (strcmp(method, "POST") == 0) {
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
    } else {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method);
    }

    /* body */
    if (cJSON_IsString(body_j) && body_j->valuestring) {
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body_j->valuestring);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)strlen(body_j->valuestring));
    }

    /* proxies — libcurl auto-detects socks5h:// vs http:// from the URL scheme */
    if (cJSON_IsString(socks_j) && socks_j->valuestring && socks_j->valuestring[0]) {
        curl_easy_setopt(curl, CURLOPT_PROXY, socks_j->valuestring);
    } else if (cJSON_IsString(http_proxy_j) && http_proxy_j->valuestring && http_proxy_j->valuestring[0]) {
        curl_easy_setopt(curl, CURLOPT_PROXY, http_proxy_j->valuestring);
    }

    /* extra/override headers — these REPLACE the impersonated default headers
     * entry-for-entry, preserving order from the JS profile so coherence
     * scores stay clean. */
    struct curl_slist *hdrs = NULL;
    if (cJSON_IsArray(headers_j)) {
        cJSON *pair;
        cJSON_ArrayForEach(pair, headers_j) {
            if (!cJSON_IsArray(pair) || cJSON_GetArraySize(pair) < 2) continue;
            cJSON *k = cJSON_GetArrayItem(pair, 0);
            cJSON *v = cJSON_GetArrayItem(pair, 1);
            if (!cJSON_IsString(k) || !cJSON_IsString(v)) continue;
            size_t need = strlen(k->valuestring) + 2 + strlen(v->valuestring) + 1;
            char *line = (char *)malloc(need);
            if (!line) continue;
            snprintf(line, need, "%s: %s", k->valuestring, v->valuestring);
            hdrs = curl_slist_append(hdrs, line);
            free(line);
        }
        if (hdrs) curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);
    }

    sink_t body = {0};
    hdr_sink_t hsink = { cJSON_CreateArray() };

    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_body_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
    curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, write_header_cb);
    curl_easy_setopt(curl, CURLOPT_HEADERDATA, &hsink);

    CURLcode rc = curl_easy_perform(curl);

    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);

    if (hdrs) curl_slist_free_all(hdrs);
    cJSON_Delete(opts);

    if (rc != CURLE_OK) {
        char msg[512];
        snprintf(msg, sizeof(msg), "curl_easy_perform: %s", curl_easy_strerror(rc));
        curl_easy_cleanup(curl);
        free(body.data);
        cJSON_Delete(hsink.arr);
        return make_error(env, msg);
    }

    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "status", (double)status);
    cJSON_AddItemToObject(root, "headers", hsink.arr);
    char *b64 = b64_encode((const unsigned char *)(body.data ? body.data : ""), body.len);
    cJSON_AddStringToObject(root, "bodyBase64", b64 ? b64 : "");
    free(b64);

    jstring out = make_jstring(env, root);
    cJSON_Delete(root);
    free(body.data);
    curl_easy_cleanup(curl);
    return out;
}

JNIEXPORT jstring JNICALL
Java_com_lexi_stealth_LexiCurlImpersonateModule_nativeListImpersonations(
    JNIEnv *env, jobject thiz) {
    /* Hard-coded list mirrors the curl_easy_impersonate targets shipped by
     * lexiforest/curl-impersonate v1.5.x. Keeping this in source means JS can
     * present a working selector even if the prebuilt .so adds new ones we
     * don't enumerate dynamically. */
    static const char *targets[] = {
        "chrome99", "chrome100", "chrome101", "chrome104", "chrome107",
        "chrome110", "chrome116", "chrome119", "chrome120", "chrome123",
        "chrome124", "chrome131", "chrome133",
        "chrome99_android", "chrome131_android",
        "edge99", "edge101",
        "safari15_3", "safari15_5", "safari17_0", "safari17_2_ios", "safari18_0", "safari18_0_ios",
        "firefox117", "firefox133", "firefox135",
        "okhttp4_9", "okhttp4_10",
        NULL
    };
    cJSON *arr = cJSON_CreateArray();
    for (int i = 0; targets[i]; i++) cJSON_AddItemToArray(arr, cJSON_CreateString(targets[i]));
    jstring out = make_jstring(env, arr);
    cJSON_Delete(arr);
    return out;
}
