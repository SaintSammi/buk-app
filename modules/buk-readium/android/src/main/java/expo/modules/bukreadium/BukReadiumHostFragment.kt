package expo.modules.bukreadium

import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ActionMode
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import android.widget.FrameLayout
import org.json.JSONObject
import androidx.fragment.app.Fragment
import androidx.fragment.app.commitNow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.SelectableNavigator
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.positions
import org.readium.r2.shared.util.AbsoluteUrl

private const val TAG = "BukReadiumHostFragment"
private const val NAV_TAG = "EpubNavigator"
private const val ARG_INITIAL_LOCATOR = "initial_locator"

/**
 * BukReadiumHostFragment
 *
 * A thin Fragment wrapper that hosts Readium's [EpubNavigatorFragment] as a child fragment.
 * It bridges events (location changes, taps) back to the parent [BukReadiumView] via [Listener].
 *
 * Lifecycle:
 *  1. Caller creates via [newInstance] and attaches using the Activity's supportFragmentManager.
 *  2. We set the childFragmentManager.fragmentFactory BEFORE super.onCreate() — mandated by Readium.
 *  3. EpubNavigatorFragment is added to a FrameLayout child in onCreateView.
 *  4. Flow collection starts in onViewCreated on STARTED state.
 */
@OptIn(ExperimentalReadiumApi::class)
class BukReadiumHostFragment : Fragment(), EpubNavigatorFragment.Listener {

    interface Listener {
        fun onNavigatorReady(positionCount: Int)
        fun onLocationChanged(locator: Locator, position: Int, positionCount: Int, progression: Double)
        fun onTap(x: Float, y: Float)
        fun onError(message: String)
        fun onSelectionChanged(selectedText: String, x: Float, y: Float, width: Float, height: Float)
        fun onSelectionCleared()
        fun onHighlightTap(id: String, colorHex: String, x: Float, y: Float, width: Float, height: Float)
        fun onHighlightApplied(id: String, locatorJson: String, colorHex: String)
    }

    var viewListener: Listener? = null

    // Supplied by caller before calling supportFragmentManager.commit
    lateinit var publication: Publication
    lateinit var navigatorFactory: EpubNavigatorFactory
    var initialPreferences: EpubPreferences? = null

    // Set after the child fragment is attached
    private var navigator: EpubNavigatorFragment? = null

    // Cached total positions — populated once navigator is ready
    private var positionCount: Int = 0
    private var cachedPositions: List<Locator> = emptyList()

    // CSS top inset (px) to inject into the epub WebView content
    private var contentInsetTopPx: Int = 0

    // ─── Highlight / selection state ──────────────────────────────────────────
    // We use WebMessagePort instead of addJavascriptInterface because
    // addJavascriptInterface only takes effect on FUTURE page navigations, not the
    // already-loaded page. WebMessagePort's postWebMessage works immediately on the
    // current page.
    private var interfaceWebView: WebView? = null
    private var webMessagePort: WebMessagePort? = null  // Android-side port (receives from JS)
    private var pendingWebPort: WebMessagePort? = null  // Web-side port (held until script runs)
    private var pendingSelectionLocator: Locator? = null
    private val highlightDecorations = mutableMapOf<String, Decoration>()

    fun setContentInsetTopPx(px: Int) {
        contentInsetTopPx = px
        injectInsetCss()
    }

    private fun findWebView(view: View?): WebView? {
        if (view == null) return null
        if (view is WebView) return view
        if (view !is ViewGroup) return null
        for (i in 0 until view.childCount) {
            findWebView(view.getChildAt(i))?.let { return it }
        }
        return null
    }

    // ─── Selection JS bridge ─────────────────────────────────────────────────

    private fun installBridgeOnWebView(webView: WebView) {
        if (webView === interfaceWebView) return
        Log.e(TAG, "installBridgeOnWebView: new WebView instance ${webView.hashCode()}")
        interfaceWebView = webView
        // injectSelectionJs() will be called by the caller (onGlobalLayout / collect block)
    }

    private fun setupHighlightBridgeIfNeeded() {
        val webView = findWebView(navigator?.view)
        Log.e(TAG, "setupHighlightBridgeIfNeeded: webView=${webView?.hashCode()} interfaceWv=${interfaceWebView?.hashCode()}")
        if (webView == null) return

        // Reinstall if this is a new WebView instance
        installBridgeOnWebView(webView)

        // Listen for taps on existing highlight decorations
        (navigator as? DecorableNavigator)?.addDecorationListener(
            "highlights",
            object : DecorableNavigator.Listener {
                override fun onDecorationActivated(event: DecorableNavigator.OnActivatedEvent): Boolean {
                    val colorHex = event.decoration.extras["colorHex"] as? String ?: return false
                    val rect = event.rect ?: return false
                    val density = resources.displayMetrics.density
                    lifecycleScope.launch(Dispatchers.Main) {
                        viewListener?.onHighlightTap(
                            event.decoration.id, colorHex,
                            rect.left / density, rect.top / density,
                            rect.width() / density, rect.height() / density
                        )
                    }
                    return true
                }
            }
        )
    }

    private fun injectSelectionJs() {
        val webView = interfaceWebView ?: return
        Log.e(TAG, "injectSelectionJs: webView=${webView.hashCode()}")

        // Close any previous port from a prior injection (page turn)
        webMessagePort?.close()
        webMessagePort = null

        // Create a fresh message channel. The android port receives messages from JS.
        // The web port is transferred to JS via postWebMessage — this works on the
        // CURRENTLY LOADED page, unlike addJavascriptInterface.
        val channel = webView.createWebMessageChannel()
        val androidPort = channel[0]
        val webPort    = channel[1]
        webMessagePort = androidPort
        pendingWebPort = webPort

        androidPort.setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: WebMessagePort, message: WebMessage) {
                val data = message.data ?: return
                Log.e(TAG, "port.msg: $data")
                try {
                    val json = JSONObject(data)
                    when (json.getString("type")) {
                        "sel" -> {
                            val text = json.getString("tx")
                            val x    = json.getDouble("x").toFloat()
                            val y    = json.getDouble("y").toFloat()
                            val w    = json.getDouble("w").toFloat()
                            val h    = json.getDouble("h").toFloat()
                            lifecycleScope.launch(Dispatchers.Main) {
                                pendingSelectionLocator = (navigator as? SelectableNavigator)
                                    ?.currentSelection()?.locator
                                Log.e(TAG, "port.sel: pending=$pendingSelectionLocator")
                                viewListener?.onSelectionChanged(text, x, y, w, h)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "port msg parse err: $e")
                }
            }
        }, Handler(Looper.getMainLooper()))

        // language=JavaScript
        val script = """
            (function(){
              // ── Clean up any previous handlers (idempotent on page-turns) ──────────
              if (window.__bukSc)  document.removeEventListener('selectionchange', window.__bukSc);
              if (window.__bukMsg) window.removeEventListener('message', window.__bukMsg);
              clearTimeout(window.__bukScT);
              window.__bukPort = null;

              // ── Report selection via debounced selectionchange ─────────────────────
              // We don't rely on touch events — Android WebView fires touchcancel (not
              // touchend) after a long-press, so touch events are unreliable here.
              // Instead we snapshot the selection synchronously and report after 80ms of
              // no further changes (handles the user dragging the selection handles).
              window.__bukSc = function() {
                clearTimeout(window.__bukScT);
                var s = window.getSelection();
                var txt = (s && s.rangeCount > 0) ? s.toString().trim() : '';
                if (!txt) return;
                // Snapshot the rect immediately while selection is still live
                var r = s.getRangeAt(0).getBoundingClientRect();
                var snap = {t: txt, x: r.left, y: r.top, w: r.width, h: r.height};
                window.__bukScT = setTimeout(function() {
                  if (!window.__bukPort) return;
                  try {
                    window.__bukPort.postMessage(JSON.stringify({type:'sel',tx:snap.t,x:snap.x,y:snap.y,w:snap.w,h:snap.h}));
                  } catch(e) {}
                }, 80);
              };
              document.addEventListener('selectionchange', window.__bukSc);

              // ── Receive the WebMessagePort from Android AND iframe relay ──────────
              window.__bukMsg = function(e) {
                if (e.data === 'buk-init' && e.ports && e.ports.length > 0) {
                  window.__bukPort = e.ports[0];
                  return;
                }
                if (e.data && e.data.t === 'bs' && e.data.m === 's' && window.__bukPort) {
                  try {
                    window.__bukPort.postMessage(JSON.stringify({type:'sel',tx:e.data.tx,x:e.data.x,y:e.data.y,w:e.data.w,h:e.data.h}));
                  } catch(ex) {}
                }
              };
              window.addEventListener('message', window.__bukMsg);

              // ── Per-iframe injection (same debounced selectionchange) ─────────────
              function injectFrame(fr) {
                try {
                  var doc = fr.contentDocument;
                  if (!doc || !doc.documentElement) return;
                  if (doc.__bukInjected) return;
                  doc.__bukInjected = true;
                  var rect = fr.getBoundingClientRect();
                  var ox = rect.left, oy = rect.top;
                  var code =
                    '(function(ox,oy){' +
                    'if(window.__bukSel)return;window.__bukSel=true;' +
                    'var t2=null;' +
                    'document.addEventListener("selectionchange",function(){' +
                      'clearTimeout(t2);' +
                      'var s=window.getSelection();' +
                      'var txt=(s&&s.rangeCount>0)?s.toString().trim():"";' +
                      'if(!txt)return;' +
                      'var r=s.getRangeAt(0).getBoundingClientRect();' +
                      'var snap={t:txt,x:r.left+ox,y:r.top+oy,w:r.width,h:r.height};' +
                      't2=setTimeout(function(){' +
                        'try{window.parent.postMessage({t:"bs",m:"s",tx:snap.t,x:snap.x,y:snap.y,w:snap.w,h:snap.h},"*");}catch(e){}' +
                      '},80);' +
                    '});' +
                    '})(' + ox + ',' + oy + ')';
                  var s = doc.createElement('script');
                  s.textContent = code;
                  doc.documentElement.appendChild(s);
                } catch(e) {}
              }

              function installAll() {
                var frames = document.querySelectorAll('iframe');
                for (var i = 0; i < frames.length; i++) {
                  var fr = frames[i];
                  if (!fr.__bukLoadWatch) {
                    fr.__bukLoadWatch = true;
                    fr.addEventListener('load', function() { injectFrame(this); });
                  }
                  injectFrame(fr);
                }
              }

              if (!window.__bukMutObs) {
                window.__bukMutObs = new MutationObserver(installAll);
                window.__bukMutObs.observe(document.documentElement, {childList:true, subtree:true});
              }

              installAll();
              setTimeout(installAll, 500);
              setTimeout(installAll, 1500);
            })();
        """.trimIndent()

        webView.post {
            webView.evaluateJavascript(script) { _ ->
                // Script is now running — the 'message' listener is live.
                // Now safe to send the web-side port. JS will receive it as a
                // 'message' event with data='buk-init' and e.ports[0] = the port.
                val wp = pendingWebPort ?: return@evaluateJavascript
                pendingWebPort = null
                Log.e(TAG, "sending buk-init port to JS")
                webView.postWebMessage(
                    WebMessage("buk-init", arrayOf(wp)),
                    Uri.parse("*")
                )

                // Diagnostic: verify port and page structure
                webView.postDelayed({
                    webView.evaluateJavascript(
                        "(function(){return JSON.stringify({port:typeof window.__bukPort," +
                        "iframes:document.querySelectorAll('iframe').length," +
                        "url:location.href.slice(0,80)})})()"
                    ) { result -> Log.e(TAG, "BUK_DIAG: $result") }
                }, 1000)
            }
        }
    }

    // ─── Public highlight API ─────────────────────────────────────────────────

    fun applyHighlight(id: String, colorHex: String) {
        Log.e(TAG, "applyHighlight: id=$id color=$colorHex pending=$pendingSelectionLocator nav=${navigator != null}")
        val color = try { Color.parseColor(colorHex) } catch (_: Exception) { return }
        // Run in a coroutine on Main so we can call currentSelection() as a fallback
        // if pendingSelectionLocator was already cleared by the selectionchange race.
        lifecycleScope.launch(Dispatchers.Main) {
            val locator = pendingSelectionLocator
                ?: (navigator as? SelectableNavigator)?.currentSelection()?.locator
            Log.e(TAG, "applyHighlight coroutine: locator=$locator")
            if (locator == null) return@launch
            pendingSelectionLocator = null
            val decoration = Decoration(
                id = id,
                locator = locator,
                style = Decoration.Style.Highlight(tint = color),
                extras = mapOf("colorHex" to colorHex)
            )
            highlightDecorations[id] = decoration
            Log.e(TAG, "applyHighlight: calling applyDecorations count=${highlightDecorations.size}")
            (navigator as? DecorableNavigator)?.applyDecorations(
                highlightDecorations.values.toList(), "highlights"
            )
            Log.e(TAG, "applyHighlight: done")
            viewListener?.onHighlightApplied(id, locator.toJSON().toString(), colorHex)
        }
    }

    fun changeHighlight(id: String, colorHex: String) {
        val existing = highlightDecorations[id] ?: return
        val color = try { Color.parseColor(colorHex) } catch (_: Exception) { return }
        highlightDecorations[id] = existing.copy(
            style = Decoration.Style.Highlight(tint = color),
            extras = mapOf("colorHex" to colorHex)
        )
        lifecycleScope.launch {
            (navigator as? DecorableNavigator)?.applyDecorations(
                highlightDecorations.values.toList(), "highlights"
            )
        }
    }

    fun removeHighlight(id: String) {
        highlightDecorations.remove(id)
        lifecycleScope.launch {
            (navigator as? DecorableNavigator)?.applyDecorations(
                highlightDecorations.values.toList(), "highlights"
            )
        }
    }

    fun setAllHighlights(json: String) {
        highlightDecorations.clear()
        try {
            val arr = org.json.JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val id = obj.getString("id")
                val locator = Locator.fromJSON(
                    org.json.JSONObject(obj.getString("locatorJson"))
                ) ?: continue
                val colorHex = obj.getString("colorHex")
                val color = try { Color.parseColor(colorHex) } catch (_: Exception) { continue }
                highlightDecorations[id] = Decoration(
                    id = id,
                    locator = locator,
                    style = Decoration.Style.Highlight(tint = color),
                    extras = mapOf("colorHex" to colorHex)
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "setAllHighlights: parse error", e)
        }
        lifecycleScope.launch {
            (navigator as? DecorableNavigator)?.applyDecorations(
                highlightDecorations.values.toList(), "highlights"
            )
        }
    }

    private fun injectInsetCss() {
        val webView = findWebView(navigator?.view) ?: return
        val css = if (contentInsetTopPx > 0) {
            "body { padding-top: ${contentInsetTopPx}px !important; }"
        } else {
            ""
        }
        val script = """(function(){var s=document.getElementById('buk-top-inset');if(!s){s=document.createElement('style');s.id='buk-top-inset';(document.head||document.documentElement).appendChild(s);}s.textContent='$css';})();"""
        webView.post { webView.evaluateJavascript(script, null) }
    }

    // ─── Fragment lifecycle ───────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i(TAG, "onCreate: savedInstanceState=${savedInstanceState != null}")
        val initialLocatorJson = arguments?.getString(ARG_INITIAL_LOCATOR)
        val initialLocator = initialLocatorJson?.let {
            try { Locator.fromJSON(org.json.JSONObject(it)) } catch (e: Exception) {
                Log.w(TAG, "Could not parse initialLocator: $it", e)
                null
            }
        }

        Log.i(TAG, "onCreate: setting fragmentFactory initialLocator=$initialLocator")
        // IMPORTANT: fragmentFactory must be set BEFORE super.onCreate()
        try {
            childFragmentManager.fragmentFactory =
                navigatorFactory.createFragmentFactory(
                    initialLocator = initialLocator,
                    initialPreferences = initialPreferences ?: EpubPreferences(),
                    listener = this
                )
            Log.i(TAG, "onCreate: fragmentFactory set OK")
        } catch (e: Exception) {
            Log.e(TAG, "onCreate: createFragmentFactory FAILED", e)
        }

        super.onCreate(savedInstanceState)
        Log.i(TAG, "onCreate: super done")
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        Log.i(TAG, "onCreateView: savedInstanceState=${savedInstanceState != null}")
        val frame = object : FrameLayout(requireContext()) {
            // Suppress the native text-selection action bar while keeping the selection
            // alive. Returning null would tell Android the action mode was cancelled,
            // which causes the WebView to immediately clear the text selection.
            // Instead we return a no-op ActionMode so Android believes an action mode
            // is active — the selection handles stay visible and the locator remains
            // available to Readium's currentSelection().
            private fun noopActionMode(): ActionMode = object : ActionMode() {
                override fun setTitle(title: CharSequence?) {}
                override fun setTitle(resId: Int) {}
                override fun setSubtitle(subtitle: CharSequence?) {}
                override fun setSubtitle(resId: Int) {}
                override fun setCustomView(view: View?) {}
                override fun invalidate() {}
                override fun finish() {}
                override fun getMenu() = null!!
                override fun getTitle(): CharSequence? = null
                override fun getSubtitle(): CharSequence? = null
                override fun getCustomView(): View? = null
                override fun getMenuInflater() = null!!
            }
            override fun startActionModeForChild(
                originalView: View, callback: ActionMode.Callback, type: Int
            ): ActionMode = noopActionMode()
            override fun startActionModeForChild(
                originalView: View, callback: ActionMode.Callback
            ): ActionMode = noopActionMode()
        }.apply {
            id = View.generateViewId()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        if (savedInstanceState == null) {
            Log.i(TAG, "onCreateView: committing EpubNavigatorFragment to frame id=${frame.id}")
            try {
                childFragmentManager.commitNow {
                    add(frame.id, EpubNavigatorFragment::class.java, Bundle(), NAV_TAG)
                }
                Log.i(TAG, "onCreateView: EpubNavigatorFragment committed")
            } catch (e: Exception) {
                Log.e(TAG, "onCreateView: EpubNavigatorFragment commit FAILED", e)
            }
        }

        navigator = childFragmentManager.findFragmentByTag(NAV_TAG) as? EpubNavigatorFragment
        Log.i(TAG, "onCreateView: navigator=${navigator != null}")

        return frame
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        Log.i(TAG, "onViewCreated: navigator=${navigator != null}")

        // Install the JavascriptInterface as soon as the WebView first appears in the
        // view tree — this is BEFORE the EPUB page finishes loading, so the interface
        // will be visible to JavaScript when the page's JS context is created.
        // Watch for WebView appearing or being replaced.
        // Readium creates an INVISIBLE placeholder WebView first, then swaps in the real
        // VISIBLE one. We must not remove this listener after the first fire — we need
        // to detect the replacement and reinstall BukSel on the new instance.
        val layoutListener = object : ViewTreeObserver.OnGlobalLayoutListener {
            private var stableCount = 0
            override fun onGlobalLayout() {
                val wv = findWebView(view) ?: return
                if (wv === interfaceWebView) {
                    // Same instance — increment stability counter and stop watching once stable
                    if (++stableCount >= 10) {
                        view.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    }
                    return
                }
                stableCount = 0
                Log.e(TAG, "onGlobalLayout: WebView instance changed to ${wv.hashCode()}")
                installBridgeOnWebView(wv)
                injectSelectionJs()
            }
        }
        view.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)

        val nav = navigator ?: run {
            Log.e(TAG, "onViewCreated: navigator is null — cannot proceed")
            return
        }

        Log.i(TAG, "onViewCreated: starting positions + flow collection")

        // Register InputListener to receive tap events (used to toggle controls overlay)
        nav.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean {
                viewListener?.onTap(event.point.x, event.point.y)
                return false // Not consumed — let Readium handle links and edge-tap navigation
            }
        })

        // Load positions first, THEN start flow collection — this ensures cachedPositions is
        // always populated before we handle any locator event. Using a single sequential
        // coroutine eliminates the race where a Flow emission arrives before positions are ready.
        // currentLocator is a StateFlow so collecting after positions load still delivers the
        // current page immediately (no events are missed).
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val positions = publication.positions()
                cachedPositions = positions
                positionCount = positions.size
                viewListener?.onNavigatorReady(positionCount)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get positions", e)
                viewListener?.onNavigatorReady(0)
            }

            // Observe current locator changes for the full lifetime of this Fragment's view.
            // Do NOT use repeatOnLifecycle(STARTED) here — that pauses collection when the
            // screen is covered (e.g. bookmarks/chapters pushed on top), causing swipe events
            // after a chapter jump to be silently dropped until the lifecycle re-enters STARTED.
            nav.currentLocator.collect { locator ->
                // Navigation has landed — the StateFlow is now authoritative, so
                // clear lastCommandedLocator (used by onStop as a fallback when the
                // StateFlow hasn't yet updated after a programmatic go() call).
                lastCommandedLocator = null

                val progression = locator.locations.totalProgression ?: 0.0
                var position = locator.locations.position ?: 0
                // After navigator.go(), Readium emits locators with null position.
                // Derive position from totalProgression using the cached positions list.
                if (position == 0) {
                    val cached = cachedPositions
                    if (cached.isNotEmpty()) {
                        val idx = (progression * (cached.size - 1)).roundToInt()
                            .coerceIn(0, cached.size - 1)
                        position = cached[idx].locations.position ?: (idx + 1)
                    }
                }
                viewListener?.onLocationChanged(locator, position, positionCount, progression)
                injectInsetCss()
                setupHighlightBridgeIfNeeded()
                injectSelectionJs()
            }
        }
    }

    // ─── EpubNavigatorFragment.Listener (HyperlinkNavigator.Listener) ────────

    // Locator saved in onStop so onResume can restore it.
    private var savedLocatorOnStop: Locator? = null
    // Target locator of the most recent programmatic navigation command.
    private var lastCommandedLocator: Locator? = null
    // Pending restore runnable.
    private var restoreRunnable: Runnable? = null
    // Set when cancelPendingRestore fires before onResume (JS thread ahead of UI thread).
    // NOT reset in onStop — that would wipe the signal set by useFocusEffect.
    private var restoreCancelled = false
    // Navigation command buffered while Fragment was STOPPED.
    // navigator.go() on a stopped WebView is silently ignored by Readium, so we
    // defer the call to onResume() where the WebView is guaranteed to be active.
    private var pendingNavAfterResume: Locator? = null

    /** Called by BukReadiumView before executing any navigation command. */
    fun cancelPendingRestore() {
        restoreRunnable?.let { view?.removeCallbacks(it) }
        restoreRunnable = null
        savedLocatorOnStop = null
        restoreCancelled = true
        Log.i(TAG, "cancelPendingRestore: restoreCancelled=true")
    }

    override fun onStop() {
        super.onStop()
        restoreRunnable?.let { view?.removeCallbacks(it) }
        restoreRunnable = null
        // Do NOT reset restoreCancelled here.
        savedLocatorOnStop = lastCommandedLocator ?: navigator?.currentLocator?.value
        Log.i(TAG, "onStop: saved pos=${savedLocatorOnStop?.locations?.position}")
    }

    override fun onStart() {
        super.onStart()
        Log.i(TAG, "onStart")
    }

    override fun onResume() {
        super.onResume()
        val cancelled = restoreCancelled
        restoreCancelled = false

        // A chapter/bookmark navigation was buffered while the Fragment was STOPPED.
        // Execute it now — the WebView is active and will process go().
        // This takes priority over everything else.
        val pendingNav = pendingNavAfterResume
        if (pendingNav != null) {
            pendingNavAfterResume = null
            savedLocatorOnStop = null
            Log.i(TAG, "onResume: executing buffered nav to pos=${pendingNav.locations?.position}")
            view?.post { lifecycleScope.launch { navigator?.go(pendingNav) } }
            return
        }

        val saved = savedLocatorOnStop ?: run {
            Log.i(TAG, "onResume: no saved locator")
            return
        }

        if (cancelled) {
            Log.i(TAG, "onResume: restore pre-cancelled, skipping")
            savedLocatorOnStop = null
            return
        }

        savedLocatorOnStop = null
        Log.i(TAG, "onResume: scheduling restore to pos=${saved.locations?.position} in 300ms")
        val v = view ?: return
        val r = Runnable {
            restoreRunnable = null
            if (restoreCancelled) { restoreCancelled = false; return@Runnable }
            Log.i(TAG, "onResume restore: firing go")
            lifecycleScope.launch { navigator?.go(saved) }
        }
        restoreRunnable = r
        v.postDelayed(r, 300)
    }

    override fun onExternalLinkActivated(url: AbsoluteUrl) {
        // External links are ignored in reading mode
        Log.d(TAG, "External link activated: $url")
    }

    // ─── Public control API ───────────────────────────────────────────────────

    fun goForward() {
        lifecycleScope.launch { navigator?.goForward() }
    }

    fun goBackward() {
        lifecycleScope.launch { navigator?.goBackward() }
    }

    /** Execute a navigation. If the Fragment is not yet RESUMED, buffers until onResume(). */
    private fun navigateTo(target: Locator) {
        lastCommandedLocator = target
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            lifecycleScope.launch { navigator?.go(target) }
        } else {
            // Fragment is STOPPED or STARTED — WebView won't process go() yet.
            // Buffer it; onResume() will execute it after the WebView is active.
            pendingNavAfterResume = target
            Log.i(TAG, "navigateTo: buffered (state=${lifecycle.currentState}) pos=${target.locations?.position}")
        }
    }

    fun go(locator: Locator) { navigateTo(locator) }

    fun goToProgression(totalProgression: Double) {
        val positions = cachedPositions
        if (positions.isEmpty()) return
        val targetIdx = (totalProgression * (positions.size - 1)).roundToInt()
            .coerceIn(0, positions.size - 1)
        navigateTo(positions[targetIdx])
    }

    fun goToPosition(position: Int) {
        val positions = cachedPositions
        if (positions.isEmpty()) return
        val idx = (position - 1).coerceIn(0, positions.size - 1)
        navigateTo(positions[idx])
    }

    fun submitPreferences(preferences: EpubPreferences) {
        navigator?.submitPreferences(preferences)
    }

    // ─── Factory ─────────────────────────────────────────────────────────────

    companion object {
        fun newInstance(initialLocatorJson: String?): BukReadiumHostFragment {
            return BukReadiumHostFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_INITIAL_LOCATOR, initialLocatorJson)
                }
            }
        }
    }
}
