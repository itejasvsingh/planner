package expo.modules.alignsms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Shared by the background receiver and the JS module: config, filtering, upload and an offline retry queue. */
internal object SmsForwarder {
  private const val PREFS = "align_sms_import"
  private const val KEY_URL = "endpoint"
  private const val KEY_TOKEN = "token"
  private const val KEY_PENDING = "pending"
  private const val MAX_PENDING = 50

  private val amount = Regex("(rs\\.?|inr|₹)\\s*[\\d,]", RegexOption.IGNORE_CASE)
  private val verb = Regex("debit|credit|spent|sent|paid|received|withdrawn|deducted|purchase", RegexOption.IGNORE_CASE)

  /** Cheap on-device pre-filter; the server does the real parsing and ignores OTPs, offers, etc. */
  fun looksLikeTransaction(text: String) = amount.containsMatchIn(text) && verb.containsMatchIn(text)

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(context: Context, endpoint: String, token: String) {
    prefs(context).edit().putString(KEY_URL, endpoint).putString(KEY_TOKEN, token).apply()
  }

  fun disable(context: Context) {
    prefs(context).edit().clear().apply()
  }

  fun isConfigured(context: Context) = prefs(context).getString(KEY_TOKEN, null) != null

  /** POSTs one message; returns true on any 2xx. */
  fun upload(context: Context, text: String): Boolean {
    val p = prefs(context)
    val endpoint = p.getString(KEY_URL, null) ?: return false
    val token = p.getString(KEY_TOKEN, null) ?: return false
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 10_000
        readTimeout = 15_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
      }
      val body = JSONObject().put("token", token).put("text", text).toString()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      conn.responseCode in 200..299
    } catch (e: Exception) {
      false
    } finally {
      conn?.disconnect()
    }
  }

  @Synchronized
  fun queue(context: Context, text: String) {
    val p = prefs(context)
    val arr = JSONArray(p.getString(KEY_PENDING, "[]"))
    arr.put(text)
    while (arr.length() > MAX_PENDING) arr.remove(0)
    p.edit().putString(KEY_PENDING, arr.toString()).apply()
  }

  /** Retries queued messages (e.g. received while offline); keeps the ones that still fail. */
  @Synchronized
  fun flushPending(context: Context): Int {
    val p = prefs(context)
    val arr = JSONArray(p.getString(KEY_PENDING, "[]"))
    val stillPending = JSONArray()
    var sent = 0
    for (i in 0 until arr.length()) {
      val text = arr.getString(i)
      if (upload(context, text)) sent++ else stillPending.put(text)
    }
    p.edit().putString(KEY_PENDING, stillPending.toString()).apply()
    return sent
  }
}
