package expo.modules.bukreadium

import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
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
    private var selectionBridgeInstalled = false
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

    private inner class BukSelectionBridge {
        @JavascriptInterface
        fun selected(text: String, x: Float, y: Float, width: Float, height: Float) {
            lifecycleScope.launch(Dispatchers.Main) {
                pendingSelectionLocator = (navigator as? SelectableNavigator)?.currentSelection()?.locator
                viewListener?.onSelectionChanged(text, x, y, width, height)
            }
        }
        @JavascriptInterface
        fun cleared() {
            lifecycleScope.launch(Dispatchers.Main) {
                pendingSelectionLocator = null
                viewListener?.onSelectionCleared()
            }
        }
    }

    private fun setupHighlightBridgeIfNeeded() {
        if (selectionBridgeInstalled) return
        val webView = findWebView(navigator?.view) ?: return
        selectionBridgeInstalled = true

        webView.addJavascriptInterface(BukSelectionBridge(), "BukSel")

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
        val webView = findWebView(navigator?.view) ?: return
        // language=JavaScript
        // Readium renders EPUB chapters in iframes; selectionchange fires on the iframe's
        // document, not the top-level one. BukSel JavascriptInterface is only on the main
        // window, but closures defined in the main-frame IIFE keep that reference.
        val script = """
            (function(){
              var BukSel = window.BukSel;
              if(!BukSel) return;

              function watchDoc(doc, offX, offY) {
                if(!doc || doc.__bukSelWatch) return;
                doc.__bukSelWatch = true;
                var targetWin = doc.defaultView;
                var t = null;
                doc.addEventListener('selectionchange', function() {
                  clearTimeout(t);
                  t = setTimeout(function() {
                    try {
                      var s = targetWin.getSelection();
                      if(!s || s.rangeCount===0 || !s.toString().trim()) {
                        BukSel.cleared(); return;
                      }
                      var r = s.getRangeAt(0).getBoundingClientRect();
                      BukSel.selected(s.toString().trim(),
                        r.left+offX, r.top+offY, r.width, r.height);
                    } catch(e) {}
                  }, 200);
                });
                doc.addEventListener('contextmenu', function(e){
                  e.preventDefault(); e.stopPropagation();
                }, true);
              }

              function installAll() {
                watchDoc(document, 0, 0);
                var frames = document.querySelectorAll('iframe');
                for(var i=0; i<frames.length; i++) {
                  try {
                    var fr = frames[i];
                    var rect = fr.getBoundingClientRect();
                    watchDoc(fr.contentDocument, rect.left, rect.top);
                  } catch(e) {}
                }
              }

              installAll();

              if(!window.__bukSelObserver) {
                window.__bukSelObserver = true;
                new MutationObserver(installAll)
                  .observe(document.documentElement, {childList:true, subtree:true});
              }
            })();
        """.trimIndent()
        webView.post { webView.evaluateJavascript(script, null) }
    }

    // ─── Public highlight API ─────────────────────────────────────────────────

    fun applyHighlight(id: String, colorHex: String) {
        val locator = pendingSelectionLocator ?: return
        pendingSelectionLocator = null
        val color = try { Color.parseColor(colorHex) } catch (_: Exception) { return }
        val decoration = Decoration(
            id = id,
            locator = locator,
            style = Decoration.Style.Highlight(tint = color),
            extras = mapOf("colorHex" to colorHex)
        )
        highlightDecorations[id] = decoration
        lifecycleScope.launch {
            (navigator as? DecorableNavigator)?.applyDecorations(
                highlightDecorations.values.toList(), "highlights"
            )
        }
        (navigator as? SelectableNavigator)?.clearSelection()
        viewListener?.onHighlightApplied(id, locator.toJSON().toString(), colorHex)
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
        val frame = FrameLayout(requireContext()).apply {
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
