package com.lexi.stealth

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * Calls into a curl-impersonate JNI .so dropped under
 * artifacts/lexi-mobile/native/curl-impersonate/jniLibs/<abi>/.
 *
 * The .so is expected to expose a single C entry point:
 *   `Java_com_lexi_stealth_LexiCurlImpersonateModule_nativeRequest(JNIEnv*, jobject, jstring opts_json) -> jstring result_json`
 *
 * If the lib isn't bundled, isAvailable() returns false and request() rejects
 * — the TS wrapper turns that into the loud `CURL_IMPERSONATE_NOT_BUNDLED`
 * error so stealth traffic never silently leaks.
 */
class LexiCurlImpersonateModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LexiCurlImpersonate"

    companion object {
        @Volatile private var loaded: Boolean = false
        @Volatile private var loadError: String? = null
        init {
            try { System.loadLibrary("curl-impersonate-chrome"); loaded = true }
            catch (t: Throwable) { loadError = t.message }
        }
    }

    private external fun nativeRequest(optsJson: String): String
    private external fun nativeListImpersonations(): String

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isAvailable(): Boolean = loaded

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun listImpersonations(): WritableArray {
        val out: WritableArray = Arguments.createArray()
        if (!loaded) return out
        try {
            val raw = nativeListImpersonations()
            val arr = org.json.JSONArray(raw)
            for (i in 0 until arr.length()) out.pushString(arr.getString(i))
        } catch (_: Throwable) {}
        return out
    }

    @ReactMethod
    fun request(opts: ReadableMap, promise: Promise) {
        if (!loaded) {
            promise.reject("CURL_NOT_LOADED", "libcurl-impersonate-chrome.so not in jniLibs (${loadError ?: "missing"})")
            return
        }
        try {
            val json = org.json.JSONObject()
            json.put("url", opts.getString("url"))
            json.put("method", opts.getString("method") ?: "GET")
            json.put("impersonate", opts.getString("impersonate") ?: "chrome120")
            json.put("body", if (opts.hasKey("body") && !opts.isNull("body")) opts.getString("body") else org.json.JSONObject.NULL)
            json.put("socksProxy", if (opts.hasKey("socksProxy") && !opts.isNull("socksProxy")) opts.getString("socksProxy") else org.json.JSONObject.NULL)
            json.put("httpProxy", if (opts.hasKey("httpProxy") && !opts.isNull("httpProxy")) opts.getString("httpProxy") else org.json.JSONObject.NULL)
            val hdrArr = org.json.JSONArray()
            val headers: ReadableArray? = if (opts.hasKey("headers") && !opts.isNull("headers")) opts.getArray("headers") else null
            if (headers != null) {
                for (i in 0 until headers.size()) {
                    val pair = headers.getArray(i)
                    if (pair.size() >= 2) {
                        val p = org.json.JSONArray()
                        p.put(pair.getString(0)); p.put(pair.getString(1))
                        hdrArr.put(p)
                    }
                }
            }
            json.put("headers", hdrArr)

            val raw = nativeRequest(json.toString())
            val parsed = org.json.JSONObject(raw)
            val r: WritableMap = Arguments.createMap()
            r.putInt("status", parsed.optInt("status", 0))
            r.putString("bodyBase64", parsed.optString("bodyBase64", ""))
            val outHdrs: WritableArray = Arguments.createArray()
            val ph = parsed.optJSONArray("headers")
            if (ph != null) {
                for (i in 0 until ph.length()) {
                    val pair = ph.getJSONArray(i)
                    val pp: WritableArray = Arguments.createArray()
                    pp.pushString(pair.optString(0)); pp.pushString(pair.optString(1))
                    outHdrs.pushArray(pp)
                }
            }
            r.putArray("headers", outHdrs)
            if (parsed.has("ja3")) r.putString("ja3", parsed.optString("ja3"))
            if (parsed.has("ja4")) r.putString("ja4", parsed.optString("ja4"))
            promise.resolve(r)
        } catch (t: Throwable) {
            promise.reject("CURL_REQUEST_FAILED", t.message, t)
        }
    }
}
