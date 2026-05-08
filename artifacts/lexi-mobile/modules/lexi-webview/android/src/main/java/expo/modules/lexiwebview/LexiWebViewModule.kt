package expo.modules.lexiwebview

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

class SubmitOptions : Record {
  @Field var url: String = ""
  @Field var fields: Map<String, String> = emptyMap()
  @Field var submitSelector: String? = null
  @Field var socksProxy: String? = null
  @Field var httpProxy: String? = null
  @Field var userAgent: String? = null
  @Field var timeoutMs: Int? = null
}

class LexiWebViewModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val mainExecutor = Executor { r -> mainHandler.post(r) }

  override fun definition() = ModuleDefinition {
    Name("LexiWebView")
    Events("onStep")

    Function("isAvailable") {
      try {
        Class.forName("android.webkit.WebView")
        true
      } catch (_: Throwable) {
        false
      }
    }

    AsyncFunction("submitForm") { opts: SubmitOptions, promise: Promise ->
      mainHandler.post {
        try {
          runSubmit(opts, promise)
        } catch (t: Throwable) {
          promise.reject("WEBVIEW_ERROR", t.message ?: "submitForm failed", t)
        }
      }
    }
  }

  private fun emitStep(step: JSONObject, steps: JSONArray) {
    steps.put(step)
    val payload = mutableMapOf<String, Any?>()
    val keys = step.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      payload[k] = step.opt(k)
    }
    try { sendEvent("onStep", payload) } catch (_: Throwable) {}
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun runSubmit(opts: SubmitOptions, promise: Promise) {
    val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val timeoutMs = (opts.timeoutMs ?: 30_000).toLong()
    val steps = JSONArray()
    val resolved = AtomicBoolean(false)

    // ---- Proxy resolution (fail-closed) ----------------------------------
    // WebView's androidx.webkit ProxyController only accepts HTTP/HTTPS
    // upstream proxies. To honor SOCKS-only backends like Tor without
    // leaking direct, we boot a tiny in-process SOCKS→HTTP-CONNECT bridge
    // (see SocksHttpBridge.kt) on a loopback port and point the WebView
    // at that. This is the parity the JS caller's comment promises.
    //
    // We never use ProxyConfig.addDirect() — unconditional fail-closed:
    // if the configured proxy can't be applied, we reject and the caller
    // can decide (the operator-eyes flow already has a fetch-transport
    // fallback path).
    val socksParts = parseProxyUri(opts.socksProxy)
    val httpParts = parseProxyUri(opts.httpProxy)
    if (!opts.socksProxy.isNullOrBlank() && socksParts == null) {
      promise.reject("WEBVIEW_PROXY_UNSUPPORTED", "Could not parse socksProxy: ${opts.socksProxy}", null); return
    }
    if (!opts.httpProxy.isNullOrBlank() && httpParts == null) {
      promise.reject("WEBVIEW_PROXY_UNSUPPORTED", "Could not parse httpProxy: ${opts.httpProxy}", null); return
    }
    val needsProxy = socksParts != null || httpParts != null
    if (needsProxy && !WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
      promise.reject(
        "WEBVIEW_PROXY_UNSUPPORTED",
        "This device's WebView is too old to apply a proxy override (PROXY_OVERRIDE feature missing).",
        null
      ); return
    }

    // If SOCKS is supplied, start the bridge and route the WebView through
    // 127.0.0.1:<bridgePort>. HTTP proxy (if also given) is ignored — SOCKS
    // takes precedence because it's the stronger anonymizer.
    var bridge: SocksHttpBridge? = null
    val proxyHostPort: String? = when {
      socksParts != null -> {
        try {
          val b = SocksHttpBridge(socksParts.host, socksParts.port, socksParts.user, socksParts.pass)
          val port = b.start()
          bridge = b
          "127.0.0.1:$port"
        } catch (t: Throwable) {
          promise.reject("WEBVIEW_PROXY_FAILED", "SOCKS→HTTP bridge could not start: ${t.message}", t)
          return
        }
      }
      httpParts != null -> "${httpParts.host}:${httpParts.port}"
      else -> null
    }

    val webView = WebView(ctx)
    val settings: WebSettings = webView.settings
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.databaseEnabled = true
    settings.loadsImagesAutomatically = false
    opts.userAgent?.let { settings.userAgentString = it }

    val proxyApplied = AtomicBoolean(false)
    fun cleanupProxy() {
      if (proxyApplied.get() && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
        try { ProxyController.getInstance().clearProxyOverride(mainExecutor) {} } catch (_: Throwable) {}
      }
      try { bridge?.stop() } catch (_: Throwable) {}
    }

    val phase = AtomicBoolean(false)
    val finalStatus = intArrayOf(200)
    val finalUrl = arrayOf<String?>(null)
    val captured = AtomicBoolean(false)
    val navigationStartedAfterSubmit = AtomicBoolean(false)

    fun resolveOnce(result: Any?) {
      if (resolved.compareAndSet(false, true)) promise.resolve(result)
    }
    fun rejectOnce(code: String, msg: String, t: Throwable? = null) {
      if (resolved.compareAndSet(false, true)) promise.reject(code, msg, t)
    }

    val statusProbeJs = """
      (function(){
        try {
          var n = performance.getEntriesByType('navigation')[0];
          return (n && typeof n.responseStatus === 'number') ? n.responseStatus : null;
        } catch (e) { return null; }
      })();
    """.trimIndent()

    fun captureFinalAndResolve(view: WebView, fallbackUrl: String) {
      if (captured.getAndSet(true)) return
      view.evaluateJavascript(statusProbeJs) { probe ->
        val parsedProbe = unquoteJsString(probe)
        parsedProbe.toIntOrNull()?.takeIf { it > 0 }?.let { finalStatus[0] = it }
        view.evaluateJavascript("(function(){return document.documentElement.outerHTML;})();") { jsonHtml ->
          val html = unquoteJsString(jsonHtml)
          val resolvedUrl = view.url ?: finalUrl[0] ?: fallbackUrl
          emitStep(
            JSONObject().put("phase", "response")
              .put("status", finalStatus[0]).put("finalUrl", resolvedUrl),
            steps
          )
          val out = mutableMapOf<String, Any?>(
            "status" to finalStatus[0],
            "finalUrl" to resolvedUrl,
            "html" to html,
            "steps" to jsonArrayToList(steps),
          )
          try { view.stopLoading(); view.destroy() } catch (_: Throwable) {}
          cleanupProxy()
          resolveOnce(out)
        }
      }
    }

    val spaSettleMs = 2_000L
    val settleRunnable = Runnable {
      if (resolved.get()) return@Runnable
      if (phase.get() && !navigationStartedAfterSubmit.get() && !captured.get()) {
        captureFinalAndResolve(webView, opts.url)
      }
    }

    val client = object : WebViewClient() {
      override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
        super.onPageStarted(view, url, favicon)
        if (phase.get() && !captured.get()) {
          navigationStartedAfterSubmit.set(true)
          mainHandler.removeCallbacks(settleRunnable)
        }
      }

      override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (resolved.get() || view == null) return
        if (!phase.get()) {
          emitStep(JSONObject().put("phase", "navigate").put("url", url ?: opts.url), steps)
          val js = buildFillAndSubmitJs(opts)
          for ((name, _) in opts.fields) {
            emitStep(JSONObject().put("phase", "fill").put("field", name), steps)
          }
          val selector = opts.submitSelector ?: "button[type=submit], input[type=submit]"
          emitStep(JSONObject().put("phase", "submit").put("selector", selector), steps)
          phase.set(true)
          view.evaluateJavascript(js) { _ ->
            mainHandler.postDelayed(settleRunnable, spaSettleMs)
          }
        } else {
          finalUrl[0] = url
          captureFinalAndResolve(view, opts.url)
        }
      }

      override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
        if (request?.isForMainFrame == true) {
          rejectOnce("WEBVIEW_LOAD_FAILED", "load error: ${error?.description}")
          try { view?.destroy() } catch (_: Throwable) {}
          cleanupProxy()
        }
      }

      override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?) {
        if (request?.isForMainFrame == true && errorResponse != null) {
          finalStatus[0] = errorResponse.statusCode
        }
      }
    }
    webView.webViewClient = client

    // Hard timeout.
    mainHandler.postDelayed({
      if (!resolved.get()) {
        try { webView.stopLoading(); webView.destroy() } catch (_: Throwable) {}
        cleanupProxy()
        rejectOnce("WEBVIEW_TIMEOUT", "submitForm timed out after ${timeoutMs}ms")
      }
    }, timeoutMs)

    // Apply proxy (no `.addDirect()` — fail-closed) and only then start
    // the navigation, so the very first byte goes through the proxy.
    if (proxyHostPort != null) {
      val proxyConfig = ProxyConfig.Builder().addProxyRule(proxyHostPort).build()
      val proxyAppliedSignal = AtomicBoolean(false)
      try {
        ProxyController.getInstance().setProxyOverride(proxyConfig, mainExecutor) {
          if (proxyAppliedSignal.compareAndSet(false, true)) {
            proxyApplied.set(true)
            if (!resolved.get()) webView.loadUrl(opts.url)
          }
        }
      } catch (t: Throwable) {
        rejectOnce("WEBVIEW_PROXY_UNSUPPORTED", "ProxyController.setProxyOverride threw: ${t.message}", t)
        try { webView.destroy() } catch (_: Throwable) {}
        cleanupProxy()
        return
      }
      mainHandler.postDelayed({
        if (!proxyAppliedSignal.get() && !resolved.get()) {
          rejectOnce("WEBVIEW_PROXY_FAILED", "ProxyController.setProxyOverride did not apply within 5s")
          try { webView.stopLoading(); webView.destroy() } catch (_: Throwable) {}
          cleanupProxy()
        }
      }, 5_000)
    } else {
      webView.loadUrl(opts.url)
    }
  }

  private fun buildFillAndSubmitJs(opts: SubmitOptions): String {
    val fieldsJson = JSONObject(opts.fields as Map<*, *>).toString()
    val selector = opts.submitSelector ?: "button[type=submit], input[type=submit]"
    val selectorJson = JSONObject.quote(selector)
    return """
      (function(){
        try {
          var fields = $fieldsJson;
          for (var name in fields) {
            var el = document.querySelector('[name="' + name.replace(/"/g, '\\"') + '"]');
            if (el) {
              el.focus();
              el.value = fields[name];
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          var btn = document.querySelector($selectorJson);
          if (btn) { btn.click(); return 'clicked'; }
          for (var n in fields) {
            var f = document.querySelector('[name="' + n.replace(/"/g, '\\"') + '"]');
            if (f && f.form) { f.form.submit(); return 'form-submit'; }
          }
          return 'no-submit-target';
        } catch (e) { return 'js-error:' + (e && e.message); }
      })();
    """.trimIndent()
  }

  private fun unquoteJsString(raw: String?): String {
    if (raw == null || raw == "null") return ""
    return try {
      val arr = JSONArray("[$raw]")
      arr.optString(0, "")
    } catch (_: Throwable) {
      raw
    }
  }

  private fun jsonArrayToList(arr: JSONArray): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val m = mutableMapOf<String, Any?>()
      val keys = o.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        m[k] = o.opt(k)
      }
      out.add(m)
    }
    return out
  }
}
