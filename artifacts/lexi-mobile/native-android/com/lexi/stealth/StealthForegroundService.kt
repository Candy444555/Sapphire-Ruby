package com.lexi.stealth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.chromium.net.CronetEngine

/**
 * Cold-boot warm-up service.
 *
 * On BOOT_COMPLETED the BroadcastReceiver starts this service, which:
 *   1. Goes foreground with a "Stealth active." notification so the JVM
 *      survives long enough to do real work.
 *   2. Reflectively starts tor-android — so the operator's first stealth
 *      request after reboot doesn't pay the 20–40s tor bootstrap.
 *   3. Builds a CronetEngine instance on the same applicationContext that
 *      LexiCronetModule will later reuse — this loads libcronet.so, primes
 *      QUIC/HTTP2 settings, and warms the engine cache, so the first JS
 *      request also doesn't pay engine-build latency.
 *   4. Holds the foreground for 90s, then self-stops. Tor stays up via its
 *      own tor-android service.
 */
class StealthForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        Thread {
            warmTor()
            warmCronet()
            try { Thread.sleep(90_000) } catch (_: InterruptedException) {}
            stopSelf()
        }.start()
        return START_NOT_STICKY
    }

    private fun warmTor() {
        try {
            val cls = Class.forName("org.torproject.jni.TorService")
            val m = cls.getMethod("startTor", android.content.Context::class.java)
            m.invoke(null, applicationContext)
        } catch (_: Throwable) {
            // tor-android not on classpath in this build — silent no-op,
            // first JS request through stealth will surface a clear error.
        }
    }

    private fun warmCronet() {
        try {
            CronetEngine.Builder(applicationContext)
                .enableHttp2(true)
                .enableQuic(true)
                .enableBrotli(true)
                .build()
        } catch (_: Throwable) {
            // cronet-embedded not on classpath — no-op; LexiCronetModule will
            // surface the missing-engine error on first JS call.
        }
    }

    private fun startInForeground() {
        val channelId = "lexi.stealth.warm"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(channelId) == null) {
                val ch = NotificationChannel(channelId, "Stealth", NotificationManager.IMPORTANCE_MIN)
                ch.setShowBadge(false)
                nm.createNotificationChannel(ch)
            }
        }
        val notif: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Lexi")
            .setContentText("Stealth active.")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }
}

private const val NOTIF_ID = 0x4C45
