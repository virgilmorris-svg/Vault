// A9CameraPackage — registers A9CameraModule and A9VideoViewManager with
// React Native so JS can import them via NativeModules / requireNativeComponent.
// The config plugin injects `packages.add(A9CameraPackage())` into
// MainApplication.kt during `expo prebuild`.
package com.emergent.securevaultsync.gbpwid.a9

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class A9CameraPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(A9CameraModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(A9VideoViewManager())
}
