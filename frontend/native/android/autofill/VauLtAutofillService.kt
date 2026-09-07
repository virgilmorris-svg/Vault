// VauLtAutofillService — Android Autofill service.
// When a login field is focused in another app / browser, Android asks this
// service for credential suggestions. We show a list of redacted stubs; the
// user picks one; we return an Authentication PendingIntent that opens VauLt
// to prompt biometric + decrypt + fill.
//
// Zero-knowledge preserved: this service reads only redacted metadata
// (id, title, username, url — NO passwords) from the app's private
// SharedPreferences. The vault ciphertext stays inside the JS runtime.
package com.emergent.securevaultsync.gbpwid

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.*
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi
import org.json.JSONArray

@RequiresApi(Build.VERSION_CODES.O)
class VauLtAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancel: CancellationSignal,
        callback: FillCallback,
    ) {
        val structure = request.fillContexts.last().structure
        val fields = mutableListOf<AutofillId>()
        traverse(structure.getWindowNodeAt(0).rootViewNode) { node ->
            node.autofillId?.let { fields.add(it) }
        }
        if (fields.isEmpty()) { callback.onSuccess(null); return }

        val entries = readEntries()
        if (entries.isEmpty()) { callback.onSuccess(null); return }

        val builder = FillResponse.Builder()
        for (e in entries.take(8)) {
            val remote = RemoteViews(packageName, R.layout.autofill_row).apply {
                setTextViewText(R.id.title, e.title)
                setTextViewText(R.id.sub, e.username ?: e.url ?: "")
            }
            val intent = Intent(Intent.ACTION_VIEW,
                Uri.parse("vault://autofill?entry_id=${e.id}"))
            val pi = PendingIntent.getActivity(this, e.id.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            val ds = Dataset.Builder(remote)
            for (id in fields) {
                ds.setValue(id, AutofillValue.forText("VauLt: tap to fill"))
            }
            ds.setAuthentication(pi.intentSender)
            builder.addDataset(ds.build())
        }
        callback.onSuccess(builder.build())
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // We do not accept save requests from the OS — users add entries in-app.
        callback.onSuccess()
    }

    private fun traverse(
        node: android.app.assist.AssistStructure.ViewNode,
        visit: (android.app.assist.AssistStructure.ViewNode) -> Unit,
    ) {
        visit(node)
        for (i in 0 until node.childCount) traverse(node.getChildAt(i), visit)
    }

    data class EntryStub(val id: String, val title: String, val username: String?, val url: String?)

    private fun readEntries(): List<EntryStub> {
        return try {
            val prefs = getSharedPreferences("vault_widget_prefs", Context.MODE_PRIVATE)
            val json = prefs.getString("entries", "[]") ?: "[]"
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                EntryStub(
                    o.getString("id"),
                    o.getString("title"),
                    if (o.isNull("username")) null else o.optString("username", null),
                    if (o.isNull("url")) null else o.optString("url", null),
                )
            }
        } catch (e: Exception) { emptyList() }
    }
}
