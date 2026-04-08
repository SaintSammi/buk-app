package expo.modules.bukepubreader

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import kotlin.math.abs

/**
 * BukEpubWebView — native WebView container for epub.js rendering.
 *
 * Architecture:
 *  - ExpoView (LinearLayout) owns layout and gesture intercept
 *  - Inner android.webkit.WebView renders the epub.js HTML template
 *  - Horizontal swipes intercepted natively; navigation driven via evaluateJavascript
 *  - All epub.js postMessage traffic forwarded as onBukMessage events
 *  - Tap events forwarded as onBukTap events with (x, y) in dp
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
class BukEpubWebView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    //  ── Events ──────────────────────────────────────────────────────────────
    internal val onBukMessage by EventDispatcher<Map<String, Any?>>()
    internal val onBukTap by EventDispatcher<Map<String, Any?>>()

    //  ── Inner WebView ────────────────────────────────────────────────────────
    internal val innerWebView: WebView = createWebView()

    //  ── State for injectJS prop ──────────────────────────────────────────────
    private var lastInjectId = Double.MIN_VALUE

    //  ── Touch state ──────────────────────────────────────────────────────────
    private var velocityTracker: VelocityTracker? = null
    private var touchStartX = 0f
    private var touchStartY = 0f
    private var isDragging = false     // actively tracking a horizontal swipe
    private var isCommitting = false   // navigation call in flight

    init {
        addView(innerWebView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    //  ── WebView setup ────────────────────────────────────────────────────────

    private fun createWebView(): WebView {
        val wv = WebView(context)

        wv.settings.apply {
            javaScriptEnabled = true
            allowFileAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        wv.setLayerType(LAYER_TYPE_HARDWARE, null)
        wv.webViewClient = WebViewClient()
        wv.webChromeClient = WebChromeClient()

        // Bridge: epub.js calls window.ReactNativeWebView.postMessage(jsonString)
        // We capture it and forward to the onBukMessage React event.
        wv.addJavascriptInterface(object {
            @JavascriptInterface
            fun postMessage(message: String) {
                Handler(Looper.getMainLooper()).post {
                    onBukMessage(mapOf("message" to message))
                }
            }
        }, "ReactNativeWebView")

        return wv
    }

    //  ── Props ────────────────────────────────────────────────────────────────

    fun loadSrc(uri: String) {
        innerWebView.loadUrl(uri)
    }

    /** JSON string  {"id": <timestamp>, "script": "<js>"}
     *  The native side executes the script each time `id` changes. */
    fun handleInjectJS(json: String?) {
        if (json.isNullOrEmpty()) return
        try {
            val obj = JSONObject(json)
            val id = obj.getDouble("id")
            if (id == lastInjectId) return
            lastInjectId = id
            val script = obj.optString("script")
            if (script.isNotEmpty()) {
                // post() ensures we're on the main thread even if called from Prop setter
                post { innerWebView.evaluateJavascript(script, null) }
            }
        } catch (_: Exception) {
            // malformed JSON — ignore
        }
    }

    //  ── Gesture interception ─────────────────────────────────────────────────

    /**
     * Intercept horizontal swipe gestures BEFORE the inner WebView sees them.
     * For non-horizontal (or ambiguous) movements we return false so the WebView
     * continues to receive touch events normally (text selection, links, etc.).
     */
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (isCommitting) return true

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                velocityTracker?.recycle()
                velocityTracker = VelocityTracker.obtain()
                velocityTracker?.addMovement(event)
                touchStartX = event.x
                touchStartY = event.y
                isDragging = false
                return false // let the WebView see the down event
            }

            MotionEvent.ACTION_MOVE -> {
                velocityTracker?.addMovement(event)
                val dx = event.x - touchStartX
                val dy = event.y - touchStartY

                if (!isDragging) {
                    val slop = ViewConfiguration.get(context).scaledTouchSlop
                    if (abs(dx) > slop && abs(dx) > abs(dy) * 1.5f) {
                        isDragging = true
                        parent?.requestDisallowInterceptTouchEvent(true)
                        return true // steal the gesture from the WebView
                    }
                }
                return isDragging
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!isDragging) {
                    // Possible tap — check timing and displacement
                    val elapsed = event.eventTime - event.downTime
                    val dx = event.x - touchStartX
                    val dy = event.y - touchStartY
                    if (elapsed < 300 && abs(dx) < 20 && abs(dy) < 20) {
                        val density = resources.displayMetrics.density
                        onBukTap(
                            mapOf(
                                "x" to (touchStartX / density).toDouble(),
                                "y" to (touchStartY / density).toDouble()
                            )
                        )
                    }
                }
                isDragging = false
                parent?.requestDisallowInterceptTouchEvent(false)
                velocityTracker?.recycle()
                velocityTracker = null
                return false
            }
        }
        return false
    }

    /**
     * Called when we've taken ownership of the gesture (isDragging = true).
     * On ACTION_UP we evaluate the commit-or-cancel threshold and fire the
     * appropriate epub.js navigation call.
     */
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                velocityTracker?.addMovement(event)
            }

            MotionEvent.ACTION_UP -> {
                velocityTracker?.addMovement(event)
                velocityTracker?.computeCurrentVelocity(1000)
                val velX = velocityTracker?.xVelocity ?: 0f
                val dx = event.x - touchStartX

                val committed = abs(dx) > width * 0.3f || abs(velX) > 500f
                if (committed) {
                    val forward = dx < 0  // left swipe → go forward
                    isCommitting = true
                    val script = if (forward) "rendition.next()" else "rendition.prev()"
                    innerWebView.evaluateJavascript(script) {
                        isCommitting = false
                    }
                }

                velocityTracker?.recycle()
                velocityTracker = null
                isDragging = false
            }

            MotionEvent.ACTION_CANCEL -> {
                velocityTracker?.recycle()
                velocityTracker = null
                isDragging = false
            }
        }
        return true
    }
}
