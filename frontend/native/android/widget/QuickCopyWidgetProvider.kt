// QuickCopyWidgetProvider — Android home-screen widget for VauLt.
// Reads redacted login stubs (id, title, username, url — NO passwords) from
// the app's private SharedPreferences and displays up to 3 rows. Tapping a row
// opens the app via `vault://quick-copy?entry_id=<id>` where biometric +
// decryption happen. Zero-knowledge preserved: this provider only sees
// non-secret metadata; the vault ciphertext stays inside the JS runtime.
package com.emergent.securevaultsync.gbpwid

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONArray

class QuickCopyWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val rv = RemoteViews(context.packageName, R.layout.quick_copy_widget)
            val entries = readEntries(context)
            val rowIds = intArrayOf(R.id.row_1, R.id.row_2, R.id.row_3)
            val titleIds = intArrayOf(R.id.title_1, R.id.title_2, R.id.title_3)
            val subIds = intArrayOf(R.id.sub_1, R.id.sub_2, R.id.sub_3)

            for (i in 0 until 3) {
                val e = entries.getOrNull(i)
                if (e != null) {
                    rv.setTextViewText(titleIds[i], e.title)
                    rv.setTextViewText(subIds[i], e.username ?: e.url ?: "")
                    rv.setViewVisibility(rowIds[i], android.view.View.VISIBLE)
                    val intent = Intent(Intent.ACTION_VIEW,
                        Uri.parse("vault://quick-copy?entry_id=${e.id}"))
                    val pi = PendingIntent.getActivity(context, i, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    rv.setOnClickPendingIntent(rowIds[i], pi)
                } else {
                    rv.setViewVisibility(rowIds[i], android.view.View.GONE)
                }
            }
            mgr.updateAppWidget(id, rv)
        }
    }

    data class EntryStub(val id: String, val title: String, val username: String?, val url: String?)

    private fun readEntries(context: Context): List<EntryStub> {
        return try {
            val prefs = context.getSharedPreferences("vault_widget_prefs", Context.MODE_PRIVATE)
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
