/* lexiforest curl-impersonate extension — declared by libcurl-impersonate.so */
#ifndef CURL_IMPERSONATE_H
#define CURL_IMPERSONATE_H
#include "curl.h"
#ifdef __cplusplus
extern "C" {
#endif
/* curl_easy_impersonate: configure a handle to impersonate a browser target.
 * target examples: "chrome120", "chrome124", "safari17_0", "firefox117".
 * default_headers: 1 to also set the impersonated default header set. */
CURLcode curl_easy_impersonate(CURL *handle, const char *target, int default_headers);
#ifdef __cplusplus
}
#endif
#endif
