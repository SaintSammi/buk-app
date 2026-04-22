package expo.modules.bukreadium

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.readium.r2.shared.ExperimentalReadiumApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.toAbsoluteUrl
import org.readium.r2.shared.util.toUrl
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser
import java.io.File
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.shared.util.getOrElse

private const val TAG = "BukReadiumView"
private const val FRAGMENT_TAG = "BukReadiumHost"

/**
 * BukReadiumView
 *
 * An [ExpoView] that hosts a Readium navigator fragment. Supports:
 *  - EPUB 2/3 (reflowable and fixed-layout) via [EpubNavigatorFactory]
 *  - PDF via [PdfNavigatorFactory] + readium-adapter-pdfium
 *
 * Props (set from React Native):
 *  - src            : file:// or content:// URI of the publication
 *  - initialLocator : serialised Readium Locator JSON
 *  - preferences    : serialised BukReadiumPreferences JSON
 *  - command        : serialised BukReadiumCommand JSON {id, type, locator?}
 *
 * Events dispatched to React Native:
 *  - onBukReady     : {positionCount}
 *  - onBukLocation  : {locator, position, positionCount, progression}
 *  - onBukTap       : {x, y}
 *  - onBukError     : {message}
 */
@OptIn(ExperimentalReadiumApi::class)
class BukReadiumView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

    // ─── Events ──────────────────────────────────────────────────────────────

    internal val onBukReady     by EventDispatcher<Map<String, Any?>>()
    internal val onBukLocation  by EventDispatcher<Map<String, Any?>>()
    internal val onBukTap       by EventDispatcher<Map<String, Any?>>()
    internal val onBukError     by EventDispatcher<Map<String, Any?>>()

    // ─── Internal state ───────────────────────────────────────────────────────

    private val mainHandler = Handler(Looper.getMainLooper())
    private var scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Fragment container — uses a compile-time XML resource ID (0x7F range) so it
    // never collides with React Native Fabric surface tags (1, 3, 5 …) or anything
    // that View.generateViewId() / ViewCompat.generateViewId() could produce.
    private val container: FrameLayout = FrameLayout(context).also {
        it.id = R.id.buk_readium_container
        addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    // Readium infrastructure — created lazily and shared across publications
    private val httpClient   by lazy { DefaultHttpClient() }
    private val assetRetriever by lazy {
        AssetRetriever(context.contentResolver, httpClient)
    }
    private val publicationOpener by lazy {
        PublicationOpener(
            publicationParser = DefaultPublicationParser(
                context = context,
                httpClient = httpClient,
                assetRetriever = assetRetriever,
                pdfFactory = null
            )
        )
    }

    // Currently mounted host fragment
    private var hostFragment: BukReadiumHostFragment? = null
    private var currentPublication: Publication? = null

    // Props buffered before the navigator is ready
    private var pendingInitialLocator: String? = null
    private var pendingPreferences: org.readium.r2.navigator.epub.EpubPreferences? = null
    private var pendingSrc: String? = null
    private var lastCommandId: Double = Double.MIN_VALUE
    private var cleanupRunnable: Runnable? = null
    // A navigation command that arrived before the navigator was ready.
    // Executed on the FIRST onLocationChanged event (= navigator is truly operational).
    private var pendingCommand: String? = null
    private var executePendingOnFirstLocation = false
    // ─── Layout ──────────────────────────────────────────────────────────────

    // React Native's Yoga engine swallows native requestLayout() calls that bubble
    // up from inside Fragments (e.g. Readium's EpubNavigatorFragment WebView).
    // We intercept and force a measure+layout pass so the Fragment view gets its size.
    override fun requestLayout() {
        super.requestLayout()
        post {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
            )
            layout(left, top, right, bottom)
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.i(TAG, "onAttachedToWindow: src=$pendingSrc hasPub=${currentPublication != null} scopeActive=${scope.isActive}")
        // Cancel any pending permanent-cleanup runnable from the last detach
        cleanupRunnable?.let { mainHandler.removeCallbacks(it) }
        cleanupRunnable = null
        // Recreate scope only if it was cancelled by a true permanent detach
        if (!scope.isActive) {
            scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
            Log.i(TAG, "onAttachedToWindow: scope recreated")
        }
        val src = pendingSrc
        if (src != null && currentPublication == null) {
            Log.i(TAG, "onAttachedToWindow: launching openPublicationInternal")
            scope.launch { openPublicationInternal(src) }
        } else {
            Log.i(TAG, "onAttachedToWindow: no launch needed (src=$src hasPub=${currentPublication != null})")
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.i(TAG, "onDetachedFromWindow: scheduling cleanup (scope NOT cancelled yet)")
        // Do NOT cancel the scope here — RN temporarily detaches views during layout.
        // After 500ms without re-attachment we treat it as a true permanent detach.
        val r = Runnable {
            if (!isAttachedToWindow) {
                Log.i(TAG, "cleanup: permanent detach — cancelling scope")
                scope.cancel()
                dismountCurrentFragment()
                currentPublication?.close()
                currentPublication = null
            } else {
                Log.i(TAG, "cleanup: view re-attached — skipping")
            }
        }
        cleanupRunnable = r
        mainHandler.postDelayed(r, 500)
    }

    // ─── Props ───────────────────────────────────────────────────────────────

    fun setInitialLocator(locator: String?) {
        pendingInitialLocator = locator
    }

    fun openPublication(src: String) {
        pendingSrc = src
        Log.i(TAG, "openPublication: src=$src attached=$isAttachedToWindow scopeActive=${scope.isActive}")
        if (!isAttachedToWindow) {
            Log.i(TAG, "openPublication: deferred until onAttachedToWindow")
            return
        }
        scope.launch {
            openPublicationInternal(src)
        }
    }

    fun handleCommand(json: String?) {
        if (json.isNullOrEmpty()) return
        try {
            val obj = JSONObject(json)
            val id = obj.getDouble("id")
            if (id == lastCommandId) return
            // IMPORTANT: do NOT set lastCommandId here — set it only when actually
            // executing. If we set it now and then buffer the command (hostFragment
            // null), the re-execution from onNavigatorReady would be rejected as a
            // duplicate, silently dropping the navigation.

            val host = hostFragment
            if (host == null) {
                // Navigator not ready yet — buffer the command and execute on onNavigatorReady
                pendingCommand = json
                return
            }
            // Cancel any pending position restore so it doesn't overwrite this command
            host.cancelPendingRestore()
            pendingCommand = null
            lastCommandId = id  // Set only when we are about to execute
            when (obj.optString("type")) {
                "next" -> host.goForward()
                "prev" -> host.goBackward()
                "goto" -> {
                    val locatorJson = obj.optString("locator").takeIf { it.isNotEmpty() }
                        ?: return
                    val locator = Locator.fromJSON(JSONObject(locatorJson)) ?: return
                    host.go(locator)
                }
                "gotoProgression" -> {
                    val progression = obj.optDouble("progression", -1.0)
                    if (progression < 0.0) return
                    host.goToProgression(progression)
                }
                "gotoPosition" -> {
                    val position = obj.optInt("position", -1)
                    if (position < 1) return
                    host.goToPosition(position)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleCommand: malformed JSON or navigation error", e)
        }
    }

    fun setContentInsetTop(insetDp: Float) {
        val px = (insetDp * resources.displayMetrics.density).toInt()
        hostFragment?.setContentInsetTopPx(px)
    }

    fun applyPreferences(json: String?) {
        if (json.isNullOrEmpty()) return
        try {
            val obj = JSONObject(json)
            val prefs = EpubPreferences(
                backgroundColor = obj.optString("backgroundColor").takeIf { it.isNotEmpty() }
                    ?.let { parseColor(it) },
                textColor = obj.optString("textColor").takeIf { it.isNotEmpty() }
                    ?.let { parseColor(it) },
                fontSize = if (obj.has("fontSize")) obj.optDouble("fontSize").takeIf { !it.isNaN() } else null,
                fontFamily = obj.optString("fontFamily").takeIf { it.isNotEmpty() }
                    ?.let { FontFamily(it) },
                lineHeight = if (obj.has("lineHeight")) obj.optDouble("lineHeight").takeIf { !it.isNaN() } else null
            )
            
            val host = hostFragment
            if (host == null) {
                pendingPreferences = prefs
            } else {
                host.submitPreferences(prefs)
            }
        } catch (e: Exception) {
            Log.w(TAG, "applyPreferences: failed to parse or apply", e)
        }
    }

    // ─── Publication opening ──────────────────────────────────────────────────

    private suspend fun openPublicationInternal(src: String) {
        Log.i(TAG, "openPublicationInternal: start src=$src")
        try {
            dismountCurrentFragment()
            currentPublication?.close()
            currentPublication = null

            val url: AbsoluteUrl = when {
                src.startsWith("content://") || src.startsWith("file://") -> {
                    android.net.Uri.parse(src).toAbsoluteUrl()
                }
                else -> {
                    File(src).toUrl()
                }
            } ?: run {
                Log.e(TAG, "openPublicationInternal: cannot resolve URI: $src")
                dispatchError("Invalid URI cannot be resolved: $src")
                return
            }

            Log.i(TAG, "openPublicationInternal: retrieving asset url=$url")
            val asset = assetRetriever.retrieve(url)
                .getOrElse { error ->
                    Log.e(TAG, "openPublicationInternal: asset retrieval failed: $error")
                    dispatchError("Failed to retrieve asset: $error")
                    return
                }

            Log.i(TAG, "openPublicationInternal: opening publication")
            val publication = publicationOpener.open(asset, allowUserInteraction = false)
                .getOrElse { error ->
                    Log.e(TAG, "openPublicationInternal: publication open failed: $error")
                    asset.close()
                    dispatchError("Failed to open publication: $error")
                    return
                }

            currentPublication = publication
            Log.i(TAG, "openPublicationInternal: publication opened conformsEpub=${publication.conformsTo(Publication.Profile.EPUB)} conformsPdf=${publication.conformsTo(Publication.Profile.PDF)}")

            when {
                publication.conformsTo(Publication.Profile.EPUB) -> mountEpubNavigator(publication)
                else -> dispatchError("Unsupported publication format (only EPUB is supported)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "openPublicationInternal failed", e)
            dispatchError("Unexpected error: ${e.message}")
        }
    }

    private fun mountEpubNavigator(publication: Publication) {
        Log.i(TAG, "mountEpubNavigator: start")
        val factory = EpubNavigatorFactory(
            publication = publication,
            configuration = EpubNavigatorFactory.Configuration(
                defaults = EpubDefaults()
            )
        )

        val fragment = BukReadiumHostFragment.newInstance(pendingInitialLocator).also {
            it.publication = publication
            it.navigatorFactory = factory
            it.viewListener = makeListener()
            pendingPreferences?.let { p -> it.initialPreferences = p }
        }

        attachFragment(fragment)
    }

    private fun attachFragment(fragment: androidx.fragment.app.Fragment) {
        Log.i(TAG, "attachFragment: containerId=${container.id} containerW=${container.width} containerH=${container.height} attached=$isAttachedToWindow")
        val activity = appContext.currentActivity as? FragmentActivity
            ?: run {
                Log.e(TAG, "attachFragment: no FragmentActivity!")
                dispatchError("No FragmentActivity available")
                return
            }

        mainHandler.post {
            Log.i(TAG, "attachFragment: committing fragment ${fragment.javaClass.simpleName}")
            try {
                if (fragment is BukReadiumHostFragment) hostFragment = fragment

                activity.supportFragmentManager
                    .beginTransaction()
                    .replace(container.id, fragment, FRAGMENT_TAG)
                    .commitNowAllowingStateLoss()
                Log.i(TAG, "attachFragment: commit success")
            } catch (e: Exception) {
                Log.e(TAG, "attachFragment failed", e)
                dispatchError("Failed to attach navigator fragment: ${e.message}")
            }
        }
    }

    private fun dismountCurrentFragment() {
        val activity = appContext.currentActivity as? FragmentActivity
            ?: return
        try {
            // Only remove the fragment that THIS BukReadiumView instance added.
            // A delayed cleanup runnable from an old instance must not remove a fragment
            // that a newer instance has already committed under the same FRAGMENT_TAG.
            val toRemove = hostFragment ?: return
            val existing = activity.supportFragmentManager.findFragmentByTag(FRAGMENT_TAG)
            if (existing === toRemove) {
                activity.supportFragmentManager.beginTransaction()
                    .remove(existing)
                    .commitNowAllowingStateLoss()
            }
            hostFragment = null
            executePendingOnFirstLocation = false
        } catch (e: Exception) {
            Log.w(TAG, "dismountCurrentFragment: $e")
        }
    }

    // ─── Listener bridge ─────────────────────────────────────────────────────

    private fun makeListener() = object : BukReadiumHostFragment.Listener {
        override fun onNavigatorReady(positionCount: Int) {
            dispatchEvent("onBukReady", mapOf("positionCount" to positionCount))
            // Don't execute pendingCommand here — the WebView may not be ready to
            // process go() calls yet. Wait for the first onLocationChanged instead,
            // which confirms the EPUB content is loaded and navigable.
            if (pendingCommand != null) {
                Log.i(TAG, "onNavigatorReady: pendingCommand present, waiting for first location event")
                executePendingOnFirstLocation = true
            }
        }

        override fun onLocationChanged(
            locator: Locator,
            position: Int,
            positionCount: Int,
            progression: Double
        ) {
            // Execute any buffered navigation command on the first real location event.
            // This is the reliable signal that the navigator WebView is fully operational.
            if (executePendingOnFirstLocation) {
                executePendingOnFirstLocation = false
                val cmd = pendingCommand
                if (cmd != null) {
                    pendingCommand = null
                    Log.i(TAG, "onLocationChanged: executing buffered command")
                    mainHandler.post { handleCommand(cmd) }
                }
            }
            try {
                // Enrich the locator JSON with the computed totalProgression so that
                // it is always present when the locator is stored as a bookmark or
                // pending-goto and later used for gotoProgression navigation.
                val locatorObj = locator.toJSON()
                val locations = locatorObj.optJSONObject("locations") ?: org.json.JSONObject().also {
                    locatorObj.put("locations", it)
                }
                locations.put("totalProgression", progression)
                val locatorJson = locatorObj.toString()
                dispatchEvent("onBukLocation", mapOf(
                    "locator"      to locatorJson,
                    "position"     to position,
                    "positionCount" to positionCount,
                    "progression"  to progression
                ))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to serialise locator", e)
            }
        }

        override fun onTap(x: Float, y: Float) {
            val density = resources.displayMetrics.density
            dispatchEvent("onBukTap", mapOf(
                "x" to (x / density).toDouble(),
                "y" to (y / density).toDouble()
            ))
        }

        override fun onError(message: String) {
            dispatchError(message)
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun dispatchError(message: String) {
        mainHandler.post {
            try { onBukError(mapOf("message" to message)) } catch (_: Exception) {}
        }
    }

    private fun dispatchEvent(eventName: String, payload: Map<String, Any?>) {
        mainHandler.post {
            try {
                when (eventName) {
                    "onBukReady"    -> onBukReady(payload)
                    "onBukLocation" -> onBukLocation(payload)
                    "onBukTap"      -> onBukTap(payload)
                    "onBukError"    -> onBukError(payload)
                }
            } catch (e: Exception) {
                Log.w(TAG, "dispatchEvent $eventName failed: $e")
            }
        }
    }

    /**
     * Parse a CSS hex colour string (#RRGGBB or #AARRGGBB) into a Readium Color.
     * Returns null on parse failure so the preference is silently skipped.
     */
    private fun parseColor(hex: String): org.readium.r2.navigator.preferences.Color? {
        return try {
            val color = android.graphics.Color.parseColor(hex)
            org.readium.r2.navigator.preferences.Color(color)
        } catch (_: Exception) { null }
    }

}
