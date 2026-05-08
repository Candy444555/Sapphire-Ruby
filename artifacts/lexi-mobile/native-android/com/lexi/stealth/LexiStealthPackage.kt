package com.lexi.stealth

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LexiStealthPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
        return mutableListOf(
            LexiCronetModule(reactContext),
            LexiTorModule(reactContext),
            LexiCurlImpersonateModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> = mutableListOf()
}
