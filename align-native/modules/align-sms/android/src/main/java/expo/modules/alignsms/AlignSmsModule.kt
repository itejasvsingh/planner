package expo.modules.alignsms

import android.content.Context
import android.net.Uri
import android.provider.Telephony
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AlignSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AlignSms")

    Function("configure") { endpoint: String, token: String ->
      SmsForwarder.configure(context, endpoint, token)
    }

    Function("disable") {
      SmsForwarder.disable(context)
    }

    Function("isConfigured") {
      SmsForwarder.isConfigured(context)
    }

    AsyncFunction("flushPending") {
      SmsForwarder.flushPending(context.applicationContext)
    }

    /** Bank-looking SMS from the inbox in the last [days] days, oldest first (needs READ_SMS). */
    AsyncFunction("readRecentTransactionSms") { days: Int ->
      val since = System.currentTimeMillis() - days.toLong() * 86_400_000L
      val out = mutableListOf<Map<String, Any>>()
      context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf(Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} > ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} ASC"
      )?.use { c ->
        val bodyIdx = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (c.moveToNext() && out.size < 300) {
          val body = c.getString(bodyIdx) ?: continue
          if (SmsForwarder.looksLikeTransaction(body)) {
            out.add(mapOf("text" to body, "date" to c.getLong(dateIdx).toDouble()))
          }
        }
      }
      out
    }
  }
}
