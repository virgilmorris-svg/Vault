// QuickCopyWidgetProvider — Android home-screen widget for VauLt.
// Reads redacted login stubs from EncryptedSharedPreferences and displays
// up to 3 rows. Tapping opens the app via `vault://quick-copy?entry_id=<id>`.
// Zero-knowledge: this provider never holds plaintext passwords.
package com.emergent.securevaultsync.gbpwid

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
            val mk = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            val prefs = EncryptedSharedPreferences.create(
                context, "vault_widget_prefs", mk,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            val json = prefs.getString("entries", "[]") ?: "[]"
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                EntryStub(o.getString("id"), o.getString("title"),
                    o.optString("username", null), o.optString("url", null))
            }
        } catch (e: Exception) { emptyList() }
    }
}
