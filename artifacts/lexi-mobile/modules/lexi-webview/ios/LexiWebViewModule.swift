import ExpoModulesCore
import WebKit
import Network

struct SubmitOptions: Record {
  @Field var url: String = ""
  @Field var fields: [String: String] = [:]
  @Field var submitSelector: String? = nil
  @Field var socksProxy: String? = nil
  @Field var httpProxy: String? = nil
  @Field var userAgent: String? = nil
  @Field var timeoutMs: Int? = nil
}

public class LexiWebViewModule: Module {
  // Strong references to in-flight controllers so they don't dealloc mid-load.
  private var inflight: [ObjectIdentifier: SubmitController] = [:]
  private let inflightLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("LexiWebView")
    Events("onStep")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("submitForm") { (opts: SubmitOptions, promise: Promise) in
      // Fail-closed proxy validation up front. WKWebView's proxy support
      // requires iOS 17+ (NWEndpoint-based ProxyConfiguration on
      // websiteDataStore). On older iOS we'd silently go direct and leak
      // the real egress IP — we reject so the JS caller can fall back to
      // the fetch transport.
      let hasProxy = !(opts.socksProxy?.isEmpty ?? true) || !(opts.httpProxy?.isEmpty ?? true)
      if hasProxy {
        if #available(iOS 17.0, *) {
          // ok — applied below
        } else {
          promise.reject("WEBVIEW_PROXY_UNSUPPORTED",
                         "WKWebView proxy routing requires iOS 17+; use the fetch transport instead.")
          return
        }
      }

      DispatchQueue.main.async {
        let controller = SubmitController(opts: opts, module: self, promise: promise)
        self.inflightLock.lock()
        self.inflight[ObjectIdentifier(controller)] = controller
        self.inflightLock.unlock()
        controller.start()
      }
    }
  }

  fileprivate func emitStep(_ payload: [String: Any?]) {
    var nonNil: [String: Any] = [:]
    for (k, v) in payload { if let v = v { nonNil[k] = v } }
    self.sendEvent("onStep", nonNil)
  }

  fileprivate func release(_ controller: SubmitController) {
    inflightLock.lock()
    inflight.removeValue(forKey: ObjectIdentifier(controller))
    inflightLock.unlock()
  }
}

private class SubmitController: NSObject, WKNavigationDelegate {
  let opts: SubmitOptions
  weak var module: LexiWebViewModule?
  let promise: Promise
  var webView: WKWebView!
  var steps: [[String: Any]] = []
  var phase: Int = 0 // 0 = initial navigation, 1 = after submit
  var finalStatus: Int = 200
  var statusCaptured: Bool = false
  var resolved = false
  var captured = false
  var navigationStartedAfterSubmit = false
  var timeoutWorkItem: DispatchWorkItem?
  var settleWorkItem: DispatchWorkItem?

  init(opts: SubmitOptions, module: LexiWebViewModule, promise: Promise) {
    self.opts = opts
    self.module = module
    self.promise = promise
  }

  func start() {
    let config = WKWebViewConfiguration()
    let hasProxy = !(opts.socksProxy?.isEmpty ?? true) || !(opts.httpProxy?.isEmpty ?? true)
    if hasProxy {
      if #available(iOS 17.0, *) {
        guard let proxy = makeProxyConfig() else {
          fail("WEBVIEW_PROXY_UNSUPPORTED", "Could not parse proxy URI: socks=\(opts.socksProxy ?? "") http=\(opts.httpProxy ?? "")")
          return
        }
        config.websiteDataStore.proxyConfigurations = [proxy]
      } else {
        // Defensive — module-level guard already rejected this case.
        fail("WEBVIEW_PROXY_UNSUPPORTED", "WKWebView proxy routing requires iOS 17+")
        return
      }
    }

    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    if let ua = opts.userAgent { webView.customUserAgent = ua }

    let timeoutMs = opts.timeoutMs ?? 30_000
    let work = DispatchWorkItem { [weak self] in self?.fail("WEBVIEW_TIMEOUT", "submitForm timed out after \(timeoutMs)ms") }
    timeoutWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: work)

    guard let url = URL(string: opts.url) else {
      fail("WEBVIEW_BAD_URL", "invalid url: \(opts.url)")
      return
    }
    webView.load(URLRequest(url: url))
  }

  @available(iOS 17.0, *)
  private func makeProxyConfig() -> ProxyConfiguration? {
    // Robust URI parsing via URLComponents — accepts bare `host:port`,
    // `scheme://host:port`, and credentialed `scheme://user:pass@host:port`
    // forms. (NWEndpoint can't carry SOCKS auth, so credentials are
    // preserved only for HTTP CONNECT via tlsOptions where applicable.)
    func parse(_ raw: String) -> (host: String, port: Int)? {
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty { return nil }
      let withScheme = trimmed.contains("://") ? trimmed : "http://" + trimmed
      guard let comps = URLComponents(string: withScheme),
            let host = comps.host,
            let port = comps.port else { return nil }
      return (host, port)
    }
    if let socks = opts.socksProxy, !socks.isEmpty, let (host, port) = parse(socks) {
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      return ProxyConfiguration(socksv5Proxy: endpoint)
    }
    if let http = opts.httpProxy, !http.isEmpty, let (host, port) = parse(http) {
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      return ProxyConfiguration(httpCONNECTProxy: endpoint, tlsOptions: nil)
    }
    return nil
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    if let http = navigationResponse.response as? HTTPURLResponse {
      finalStatus = http.statusCode
      statusCaptured = true
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    if phase == 1 && !captured {
      // Real navigation kicked off by the submit click. Cancel the
      // SPA-settle fallback and wait for didFinish to capture the new page.
      navigationStartedAfterSubmit = true
      settleWorkItem?.cancel()
      settleWorkItem = nil
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if resolved { return }
    if phase == 0 {
      emit(["phase": "navigate", "url": webView.url?.absoluteString ?? opts.url])
      for name in opts.fields.keys {
        emit(["phase": "fill", "field": name])
      }
      let selector = opts.submitSelector ?? "button[type=submit], input[type=submit]"
      emit(["phase": "submit", "selector": selector])
      phase = 1
      let js = buildFillAndSubmitJs()
      webView.evaluateJavaScript(js) { [weak self] _, _ in
        guard let self = self else { return }
        // SPA-settle: if no real navigation begins within 2s, capture the
        // mutated DOM as the result. Real navigations cancel this in
        // didStartProvisionalNavigation.
        let work = DispatchWorkItem { [weak self] in
          guard let self = self else { return }
          if !self.resolved && !self.navigationStartedAfterSubmit && !self.captured {
            self.captureFinalAndResolve()
          }
        }
        self.settleWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(2_000), execute: work)
      }
    } else {
      captureFinalAndResolve()
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    fail("WEBVIEW_LOAD_FAILED", error.localizedDescription)
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fail("WEBVIEW_LOAD_FAILED", error.localizedDescription)
  }

  private func captureFinalAndResolve() {
    if captured { return }
    captured = true
    let finalUrl = webView.url?.absoluteString ?? opts.url
    // Try to read true HTTP status via PerformanceNavigationTiming
    // (Safari 16+) so SPA-settled pages report a real status code.
    let probe = """
    (function(){
      try {
        var n = performance.getEntriesByType('navigation')[0];
        return (n && typeof n.responseStatus === 'number') ? n.responseStatus : null;
      } catch (e) { return null; }
    })();
    """
    webView.evaluateJavaScript(probe) { [weak self] result, _ in
      guard let self = self else { return }
      if let status = result as? Int, status > 0 {
        self.finalStatus = status
        self.statusCaptured = true
      }
      self.webView.evaluateJavaScript("document.documentElement.outerHTML") { [weak self] result, _ in
        guard let self = self else { return }
        let html = (result as? String) ?? ""
        self.emit(["phase": "response", "status": self.finalStatus, "finalUrl": finalUrl])
        self.succeed([
          "status": self.finalStatus,
          "finalUrl": finalUrl,
          "html": html,
          "steps": self.steps,
        ])
      }
    }
  }

  private func buildFillAndSubmitJs() -> String {
    let fieldsData = try? JSONSerialization.data(withJSONObject: opts.fields, options: [])
    let fieldsJson = fieldsData.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    let selector = opts.submitSelector ?? "button[type=submit], input[type=submit]"
    let selectorData = try? JSONSerialization.data(withJSONObject: [selector], options: [])
    let selectorJsonArr = selectorData.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
    return """
    (function(){
      try {
        var fields = \(fieldsJson);
        var selArr = \(selectorJsonArr);
        var sel = selArr[0];
        for (var name in fields) {
          var el = document.querySelector('[name="' + name.replace(/"/g,'\\\\"') + '"]');
          if (el) {
            el.focus();
            el.value = fields[name];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        var btn = document.querySelector(sel);
        if (btn) { btn.click(); return 'clicked'; }
        for (var n in fields) {
          var f = document.querySelector('[name="' + n.replace(/"/g,'\\\\"') + '"]');
          if (f && f.form) { f.form.submit(); return 'form-submit'; }
        }
        return 'no-submit-target';
      } catch (e) { return 'js-error:' + (e && e.message); }
    })();
    """
  }

  private func emit(_ payload: [String: Any?]) {
    var clean: [String: Any] = [:]
    for (k, v) in payload { if let v = v { clean[k] = v } }
    steps.append(clean)
    module?.emitStep(payload)
  }

  private func succeed(_ result: [String: Any]) {
    if resolved { return }
    resolved = true
    timeoutWorkItem?.cancel()
    settleWorkItem?.cancel()
    promise.resolve(result)
    cleanup()
  }

  private func fail(_ code: String, _ message: String) {
    if resolved { return }
    resolved = true
    timeoutWorkItem?.cancel()
    settleWorkItem?.cancel()
    promise.reject(code, message)
    cleanup()
  }

  private func cleanup() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.webView?.stopLoading()
      self.webView?.navigationDelegate = nil
      self.module?.release(self)
    }
  }
}
