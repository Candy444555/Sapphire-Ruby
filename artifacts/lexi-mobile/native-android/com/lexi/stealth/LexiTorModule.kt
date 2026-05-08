package com.lexi.stealth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.reflect.Method
import java.net.Socket

/**
 * Bridge to tor-android (info.guardianproject:tor-android) + jtorctl
 * (net.freehaven.tor.control). Uses reflection so the module compiles even
 * while the AAR is being swapped (e.g. tor-android → arti-mobile).
 *
 * Real telemetry: bootstrap %, circuit-status, exit address — all via the
 * tor control port (default 127.0.0.1:9051) using jtorctl's `getInfo()`.
 */
class LexiTorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LexiTor"

    @Volatile private var torService: Any? = null
    @Volatile private var socksPort: Int = 0
    @Volatile private var lastError: String? = null

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isAvailable(): Boolean = try {
        Class.forName("org.torproject.jni.TorService"); true
    } catch (t: Throwable) { false }

    @ReactMethod
    fun startTor(opts: ReadableMap?, promise: Promise) {
        try {
            val serviceCls = Class.forName("org.torproject.jni.TorService")
            val startM: Method = serviceCls.getMethod("startTor", android.content.Context::class.java)
            torService = startM.invoke(null, reactContext.applicationContext)
            socksPort = try {
                val m = serviceCls.getMethod("getSocksPort")
                (m.invoke(torService) as? Int) ?: 9050
            } catch (_: Throwable) { 9050 }
            val r = Arguments.createMap(); r.putInt("socksPort", socksPort)
            promise.resolve(r)
            emit("startTor", null)
        } catch (t: Throwable) {
            lastError = t.message
            promise.reject("TOR_START_FAILED", t.message, t)
        }
    }

    @ReactMethod
    fun stopTor(promise: Promise) {
        try {
            val serviceCls = Class.forName("org.torproject.jni.TorService")
            val stopM = serviceCls.getMethod("stopTor", android.content.Context::class.java)
            stopM.invoke(null, reactContext.applicationContext)
            torService = null; socksPort = 0
            promise.resolve(null)
        } catch (t: Throwable) { promise.reject("TOR_STOP_FAILED", t.message, t) }
    }

    @ReactMethod
    fun newCircuit(promise: Promise) {
        withControl(promise) { ctlCls, ctl ->
            ctlCls.getMethod("authenticate", ByteArray::class.java).invoke(ctl, ByteArray(0))
            ctlCls.getMethod("signal", String::class.java).invoke(ctl, "NEWNYM")
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getSocksPort(promise: Promise) {
        if (socksPort > 0) promise.resolve(socksPort)
        else promise.reject("TOR_NOT_STARTED", "Tor not started")
    }

    @ReactMethod
    fun getCircuitInfo(promise: Promise) {
        withControl(promise) { ctlCls, ctl ->
            ctlCls.getMethod("authenticate", ByteArray::class.java).invoke(ctl, ByteArray(0))
            val getInfo = ctlCls.getMethod("getInfo", String::class.java)
            val circuitStatus = (getInfo.invoke(ctl, "circuit-status") as? String) ?: ""
            val addr = (getInfo.invoke(ctl, "address") as? String) ?: ""
            val r: WritableMap = Arguments.createMap()
            r.putBoolean("isReady", circuitStatus.isNotBlank())
            r.putString("exitIp", if (addr.isBlank()) null else addr)
            val nodes: WritableArray = Arguments.createArray()
            // Each circuit-status line: "<id> BUILT $FP1~nick,$FP2~nick,$FP3~nick PURPOSE=GENERAL ..."
            for (line in circuitStatus.lineSequence()) {
                val parts = line.trim().split(' ')
                if (parts.size < 3) continue
                if (parts[1] != "BUILT") continue
                for (hop in parts[2].split(',')) {
                    val tilde = hop.indexOf('~')
                    val fp = if (tilde > 0) hop.substring(0, tilde) else hop
                    val nick = if (tilde > 0) hop.substring(tilde + 1) else ""
                    val n: WritableMap = Arguments.createMap()
                    n.putString("fingerprint", fp.trimStart('$'))
                    n.putString("nickname", nick)
                    n.putString("country", null)
                    nodes.pushMap(n)
                }
                break // one circuit's worth is plenty for the verifier
            }
            r.putArray("nodes", nodes)
            promise.resolve(r)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        val r: WritableMap = Arguments.createMap()
        r.putBoolean("running", torService != null)
        var bootstrapped = 0
        try {
            withControlSync { ctlCls, ctl ->
                ctlCls.getMethod("authenticate", ByteArray::class.java).invoke(ctl, ByteArray(0))
                val getInfo = ctlCls.getMethod("getInfo", String::class.java)
                val phase = (getInfo.invoke(ctl, "status/bootstrap-phase") as? String) ?: ""
                val m = Regex("PROGRESS=(\\d+)").find(phase)
                if (m != null) bootstrapped = m.groupValues[1].toIntOrNull() ?: 0
            }
        } catch (_: Throwable) {}
        r.putInt("bootstrapped", bootstrapped)
        if (lastError != null) r.putString("lastError", lastError)
        promise.resolve(r)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun withControl(promise: Promise, fn: (Class<*>, Any) -> Unit) {
        try { withControlSync(fn) }
        catch (t: Throwable) { promise.reject("TOR_CTRL_FAILED", t.message, t) }
    }
    private fun withControlSync(fn: (Class<*>, Any) -> Unit) {
        val ctlCls = Class.forName("net.freehaven.tor.control.TorControlConnection")
        val socket = Socket("127.0.0.1", 9051)
        try {
            val ctor = ctlCls.getConstructor(Socket::class.java)
            val ctl = ctor.newInstance(socket)
            fn(ctlCls, ctl)
        } finally { try { socket.close() } catch (_: Throwable) {} }
    }

    private fun emit(type: String, payload: String?) {
        val map: WritableMap = Arguments.createMap()
        map.putString("type", type); if (payload != null) map.putString("payload", payload)
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LexiTorEvent", map)
    }
}
