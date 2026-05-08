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
import org.chromium.net.CronetEngine
import org.chromium.net.UploadDataProviders
import org.chromium.net.UrlRequest
import org.chromium.net.UrlResponseInfo
import java.nio.ByteBuffer
import java.util.concurrent.Executors

class LexiCronetModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LexiCronet"

    private val executor = Executors.newCachedThreadPool()
    @Volatile private var engine: CronetEngine? = null

    private fun ensureEngine(): CronetEngine? {
        if (engine != null) return engine
        return try {
            engine = CronetEngine.Builder(reactContext.applicationContext)
                .enableHttp2(true)
                .enableQuic(true)
                .enableBrotli(true)
                .build()
            engine
        } catch (_: Throwable) { null }
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isAvailable(): Boolean = try {
        Class.forName("org.chromium.net.CronetEngine")
        ensureEngine() != null
    } catch (_: Throwable) { false }

    private inner class CollectingCallback(val promise: Promise) : UrlRequest.Callback() {
        private val collected = GrowableBuffer()
        override fun onRedirectReceived(req: UrlRequest, info: UrlResponseInfo, newLocationUrl: String) { req.followRedirect() }
        override fun onResponseStarted(req: UrlRequest, info: UrlResponseInfo) { req.read(ByteBuffer.allocateDirect(64 * 1024)) }
        override fun onReadCompleted(req: UrlRequest, info: UrlResponseInfo, byteBuffer: ByteBuffer) {
            byteBuffer.flip()
            val arr = ByteArray(byteBuffer.remaining())
            byteBuffer.get(arr)
            collected.write(arr)
            byteBuffer.clear()
            req.read(byteBuffer)
        }
        override fun onSucceeded(req: UrlRequest, info: UrlResponseInfo) {
            val resp: WritableMap = Arguments.createMap()
            resp.putInt("status", info.httpStatusCode)
            val hdrs: WritableArray = Arguments.createArray()
            for ((k, v) in info.allHeadersAsList) {
                val pair: WritableArray = Arguments.createArray()
                pair.pushString(k); pair.pushString(v)
                hdrs.pushArray(pair)
            }
            resp.putArray("headers", hdrs)
            resp.putString("bodyBase64", Base64.encodeToString(collected.toByteArray(), Base64.NO_WRAP))
            resp.putString("negotiatedProtocol", info.negotiatedProtocol)
            promise.resolve(resp)
        }
        override fun onFailed(req: UrlRequest, info: UrlResponseInfo?, error: org.chromium.net.CronetException) {
            promise.reject("CRONET_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun request(opts: ReadableMap, promise: Promise) {
        val eng = ensureEngine()
        if (eng == null) { promise.reject("CRONET_UNAVAILABLE", "Cronet engine could not be initialized"); return }
        try {
            val url = opts.getString("url") ?: throw IllegalArgumentException("url")
            val method = opts.getString("method") ?: "GET"
            val headers = opts.getArray("headers")
            val body = if (opts.hasKey("body") && !opts.isNull("body")) opts.getString("body") else null
            val builder = eng.newUrlRequestBuilder(url, CollectingCallback(promise), executor)
            builder.setHttpMethod(method)
            if (headers != null) {
                for (i in 0 until headers.size()) {
                    val pair: ReadableArray = headers.getArray(i)
                    if (pair.size() >= 2) builder.addHeader(pair.getString(0), pair.getString(1))
                }
            }
            if (body != null && method != "GET" && method != "HEAD") {
                builder.setUploadDataProvider(UploadDataProviders.create(body.toByteArray(Charsets.UTF_8)), executor)
            }
            builder.build().start()
        } catch (t: Throwable) {
            promise.reject("CRONET_ERROR", t.message, t)
        }
    }

    /**
     * Real fingerprint measurement. We just do a GET against the supplied
     * reflector and return the FULL response (status / headers / bodyBase64
     * / negotiatedProtocol) — JS owns parsing JA3/JA4/H2 out of the
     * reflector's JSON body. No synthetic strings.
     */
    @ReactMethod
    fun fingerprintProbe(profileKey: String, endpoint: String?, promise: Promise) {
        val eng = ensureEngine()
        if (eng == null) { promise.reject("CRONET_UNAVAILABLE", "engine missing"); return }
        val url = if (endpoint.isNullOrBlank()) "https://tls.peet.ws/api/all" else endpoint
        try {
            eng.newUrlRequestBuilder(url, CollectingCallback(promise), executor)
                .setHttpMethod("GET")
                .build().start()
        } catch (t: Throwable) {
            promise.reject("CRONET_ERROR", t.message, t)
        }
    }
}

private class GrowableBuffer {
    private var buf = ByteArray(8192)
    private var size = 0
    fun write(arr: ByteArray) {
        if (size + arr.size > buf.size) {
            val nb = ByteArray(maxOf(buf.size * 2, size + arr.size))
            System.arraycopy(buf, 0, nb, 0, size); buf = nb
        }
        System.arraycopy(arr, 0, buf, size, arr.size); size += arr.size
    }
    fun toByteArray(): ByteArray { val out = ByteArray(size); System.arraycopy(buf, 0, out, 0, size); return out }
}
