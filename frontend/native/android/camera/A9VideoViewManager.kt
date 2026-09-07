// A9VideoViewManager — exposes A9VideoView to React Native via
// UIManager as the native component "A9VideoView".
// Props:
//   nal (String): a NEW base64-encoded NAL unit to feed the decoder.
//     JS should update this on every incoming frame (RN diffs the value).
package com.emergent.securevaultsync.gbpwid.a9

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class A9VideoViewManager : SimpleViewManager<A9VideoView>() {
    override fun getName(): String = "A9VideoView"
    override fun createViewInstance(reactContext: ThemedReactContext): A9VideoView =
        A9VideoView(reactContext)

    @ReactProp(name = "nal")
    fun setNal(view: A9VideoView, nal: String?) {
        if (!nal.isNullOrEmpty()) view.feedBase64(nal)
    }
}
