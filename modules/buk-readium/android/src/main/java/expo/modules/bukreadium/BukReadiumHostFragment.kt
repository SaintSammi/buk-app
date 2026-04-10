package expo.modules.bukreadium

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.Fragment
import androidx.fragment.app.commitNow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
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

    // Set after the child fragment is attached
    private var navigator: EpubNavigatorFragment? = null

    // Cached total positions — populated once navigator is ready
    private var positionCount: Int = 0

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
        // Compute positions list once — this suspends briefly
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                positionCount = publication.positions().size
                viewListener?.onNavigatorReady(positionCount)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get positions", e)
                viewListener?.onNavigatorReady(0)
            }
        }

        // Register InputListener to receive tap events (used to toggle controls overlay)
        nav.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean {
                viewListener?.onTap(event.point.x, event.point.y)
                return false // Not consumed — let Readium handle links and edge-tap navigation
            }
        })

        // Observe current locator changes
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                nav.currentLocator.collect { locator ->
                    val progression = locator.locations.totalProgression ?: 0.0
                    val position = locator.locations.position ?: 0
                    viewListener?.onLocationChanged(locator, position, positionCount, progression)
                }
            }
        }
    }

    // ─── EpubNavigatorFragment.Listener (HyperlinkNavigator.Listener) ────────

    override fun onStart() {
        super.onStart()
        Log.i(TAG, "onStart: navigator=${navigator != null} navigatorView=${navigator?.view != null}")
    }

    override fun onResume() {
        super.onResume()
        Log.i(TAG, "onResume: navigator=${navigator != null}")
    }

    override fun onExternalLinkActivated(url: AbsoluteUrl) {
        // External links are ignored in reading mode
        Log.d(TAG, "External link activated: $url")
    }

    // ─── Public control API ───────────────────────────────────────────────────

    fun goForward() {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.goForward() }
    }

    fun goBackward() {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.goBackward() }
    }

    fun go(locator: Locator) {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.go(locator) }
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
