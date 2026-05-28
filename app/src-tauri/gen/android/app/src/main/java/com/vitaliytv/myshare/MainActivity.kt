package com.vitaliytv.myshare

import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var sharedWebView: WebView? = null
  private var pendingSharedText: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Cold start через Android Share — WebView ще не створений, зберігаємо.
    extractSharedText(intent)?.let { pendingSharedText = it }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    sharedWebView = webView
    // Доставляємо share, що чекав на створення WebView (cold-start випадок).
    pendingSharedText?.let { dispatchSharedText(it) }
    pendingSharedText = null
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // setIntent гарантує, що getIntent() поверне свіжий intent (а не stale из onCreate).
    setIntent(intent)
    extractSharedText(intent)?.let { text ->
      if (sharedWebView != null) dispatchSharedText(text)
      else pendingSharedText = text
    }
  }

  // Витягуємо text/plain з ACTION_SEND. Інші intents ігноруємо.
  private fun extractSharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND) return null
    if (intent.type != "text/plain") return null
    return intent.getStringExtra(Intent.EXTRA_TEXT)
  }

  // Скидаємо у WebView: пишемо у localStorage (для перечитування у onMounted),
  // і диспатчимо CustomEvent (для in-app оновлення коли додаток уже відкритий).
  // JSONObject.quote коректно escape'ить лапки / зворотні слеши / unicode.
  private fun dispatchSharedText(text: String) {
    val webView = sharedWebView ?: return
    val quoted = JSONObject.quote(text)
    val js = """
      try { window.localStorage.setItem('myshare.sharedText', $quoted); } catch(e) {}
      try { window.dispatchEvent(new CustomEvent('myshare:android-share', { detail: { text: $quoted } })); } catch(e) {}
    """.trimIndent()
    webView.post {
      webView.evaluateJavascript(js, null)
    }
  }
}
