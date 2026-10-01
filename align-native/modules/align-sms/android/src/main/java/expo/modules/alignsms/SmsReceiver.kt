package expo.modules.alignsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlin.concurrent.thread

/** Runs even when Align is closed: forwards bank/UPI SMS to the Align ingest endpoint. */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (!SmsForwarder.isConfigured(context)) return

    // A long SMS arrives as several parts; join them per sender
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    val texts = parts.groupBy { it.displayOriginatingAddress ?: "" }
      .values
      .map { group -> group.joinToString("") { it.displayMessageBody ?: "" } }
      .filter { SmsForwarder.looksLikeTransaction(it) }
    if (texts.isEmpty()) return

    val pending = goAsync()
    thread {
      try {
        val app = context.applicationContext
        SmsForwarder.flushPending(app)
        for (text in texts) {
          if (!SmsForwarder.upload(app, text)) SmsForwarder.queue(app, text)
        }
      } finally {
        pending.finish()
      }
    }
  }
}
