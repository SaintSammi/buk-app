package expo.modules.bukreadium

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.fragment.app.Fragment
import androidx.fragment.app.commitNow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
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
            }
        }
    }

    // ─── EpubNavigatorFragment.Listener (HyperlinkNavigator.Listener) ────────

    // Locator saved in onStop so onResume can restore it instead of using
    // Readium's built-in initialLocator reset which always goes back to the
    // position the book was opened at (not where the user navigated to).
    private var savedLocatorOnStop: Locator? = null
    // The TARGET locator of the most recent programmatic navigation command.
    // Set in go/goToProgression/goToPosition, cleared when the Flow confirms
    // the navigation has landed. Lets onStop capture the correct position even
    // when navigator.currentLocator.value hasn't updated yet (async WebView ack).
    private var lastCommandedLocator: Locator? = null
    // Pending restore runnable — cancelled if a navigation command arrives first
    // (e.g. a pending-goto chapter/bookmark tap from the JS side).
    private var restoreRunnable: Runnable? = null

    /** Cancel a pending position restore. Called by BukReadiumView when any navigation command fires. */
    fun cancelPendingRestore() {
        restoreRunnable?.let { view?.removeCallbacks(it) }
        restoreRunnable = null
        savedLocatorOnStop = null
        Log.i(TAG, "cancelPendingRestore: restore cancelled")
    }

    override fun onStop() {
        super.onStop()
        // Cancel any leftover restore from a previous resume cycle
        restoreRunnable?.let { view?.removeCallbacks(it) }
        restoreRunnable = null
        // Prefer lastCommandedLocator (the target of the most recent go() call) over
        // navigator.currentLocator.value — the StateFlow may not have updated yet if the
        // WebView hasn't finished processing the navigation (async JS ack).
        savedLocatorOnStop = lastCommandedLocator ?: navigator?.currentLocator?.value
        Log.i(TAG, "onStop: saved locator=${savedLocatorOnStop?.locations?.position} (fromCommand=${lastCommandedLocator != null})")
    }

    override fun onStart() {
        super.onStart()
        Log.i(TAG, "onStart: navigator=${navigator != null}")
        // Restore is deferred to onResume() + postDelayed so it runs after
        // EpubNavigatorFragment's own onStart() resets the WebView to initialLocator,
        // AND after the JS bridge has had time to deliver any pending-goto command.
    }

    override fun onResume() {
        super.onResume()
        val saved = savedLocatorOnStop ?: run {
            Log.i(TAG, "onResume: no saved locator")
            return
        }
        savedLocatorOnStop = null
        Log.i(TAG, "onResume: scheduling restore to pos=${saved.locations?.position} in 350ms")
        val v = view ?: return
        val r = Runnable {
            restoreRunnable = null
            Log.i(TAG, "onResume restore: firing navigator.go pos=${saved.locations?.position}")
            lifecycleScope.launch { navigator?.go(saved) }
        }
        restoreRunnable = r
        // 350ms gives the JS bridge enough time to deliver a pending-goto command
        // (chapter/bookmark tap). If a command arrives, cancelPendingRestore() removes
        // this runnable. If no command arrives within 350ms, we restore position normally.
        v.postDelayed(r, 350)
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

    fun go(locator: Locator) {
        lastCommandedLocator = locator
        lifecycleScope.launch { navigator?.go(locator) }
    }

    fun goToProgression(totalProgression: Double) {
        // Use cachedPositions (already loaded, no suspend) and lifecycleScope
        // (Fragment-level, never cancelled by view destroy/create cycles) so
        // that navigation commands always execute even during transitions.
        val positions = cachedPositions
        if (positions.isEmpty()) return
        val targetIdx = (totalProgression * (positions.size - 1)).roundToInt()
            .coerceIn(0, positions.size - 1)
        val target = positions[targetIdx]
        lastCommandedLocator = target
        lifecycleScope.launch { navigator?.go(target) }
    }

    fun goToPosition(position: Int) {
        val positions = cachedPositions
        if (positions.isEmpty()) return
        val idx = (position - 1).coerceIn(0, positions.size - 1)
        val target = positions[idx]
        lastCommandedLocator = target
        lifecycleScope.launch { navigator?.go(target) }
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
