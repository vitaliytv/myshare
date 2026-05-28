package com.vitaliytv.myshare

import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var pendingSharedText: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    pendingSharedText = extractSharedText(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    publishSharedText(extractSharedText(intent))
  }

  override fun onWebViewCreated(webView: WebView) {
    super.onWebViewCreated(webView)
    publishSharedText(pendingSharedText)
    pendingSharedText = null
  }

  private fun extractSharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return null

    return intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
  }

  private fun publishSharedText(text: String?) {
    if (text.isNullOrBlank()) return

    val quotedText = JSONObject.quote(text)
    val script = """
      window.localStorage.setItem('myshare.sharedText', $quotedText);
      window.dispatchEvent(new CustomEvent('myshare:android-share', { detail: { text: $quotedText } }));
    """.trimIndent()

    runOnUiThread {
      webView.evaluateJavascript(script, null)
    }
  }
}
