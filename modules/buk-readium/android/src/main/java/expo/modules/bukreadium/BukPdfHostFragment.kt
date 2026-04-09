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
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.navigator.pdf.PdfNavigatorFactory
import org.readium.r2.navigator.pdf.PdfNavigatorFragment
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.positions

private const val TAG = "BukPdfHostFragment"
private const val NAV_TAG = "PdfNavigator"
private const val ARG_INITIAL_LOCATOR = "initial_locator"

/**
 * PDF counterpart of [BukReadiumHostFragment].
 * Hosts a [PdfNavigatorFragment] and bridges events to [BukReadiumView.Listener].
 */
@OptIn(ExperimentalReadiumApi::class)
class BukPdfHostFragment : Fragment(), PdfNavigatorFragment.Listener {

    var viewListener: BukReadiumHostFragment.Listener? = null

    lateinit var publication: Publication
    lateinit var navigatorFactory: PdfNavigatorFactory<*, *, *>

    private var navigator: PdfNavigatorFragment<*, *>? = null
    private var positionCount: Int = 0

    // ─── Fragment lifecycle ───────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        val initialLocatorJson = arguments?.getString(ARG_INITIAL_LOCATOR)
        val initialLocator = initialLocatorJson?.let {
            try { Locator.fromJSON(org.json.JSONObject(it)) } catch (e: Exception) {
                Log.w(TAG, "Could not parse initialLocator", e)
                null
            }
        }

        childFragmentManager.fragmentFactory =
            navigatorFactory.createFragmentFactory(
                initialLocator = initialLocator,
                listener = this
            )

        super.onCreate(savedInstanceState)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val frame = FrameLayout(requireContext()).apply {
            id = View.generateViewId()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        if (savedInstanceState == null) {
            childFragmentManager.commitNow {
                add(frame.id, PdfNavigatorFragment::class.java, Bundle(), NAV_TAG)
            }
        }

        @Suppress("UNCHECKED_CAST")
        navigator = childFragmentManager.findFragmentByTag(NAV_TAG) as? PdfNavigatorFragment<*, *>

        return frame
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val nav = navigator ?: return

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                positionCount = publication.positions().size
                viewListener?.onNavigatorReady(positionCount)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get positions", e)
                viewListener?.onNavigatorReady(0)
            }
        }

        nav.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean {
                viewListener?.onTap(event.point.x, event.point.y)
                return false
            }
        })

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

    // ─── PdfNavigatorFragment.Listener ───────────────────────────────────────
    // No abstract methods — Navigator.Listener defaults cover onJumpToLocator

    // ─── Control API ─────────────────────────────────────────────────────────

    fun goForward() {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.goForward() }
    }

    fun goBackward() {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.goBackward() }
    }

    fun go(locator: Locator) {
        viewLifecycleOwner.lifecycleScope.launch { navigator?.go(locator) }
    }

    companion object {
        fun newInstance(initialLocatorJson: String?): BukPdfHostFragment {
            return BukPdfHostFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_INITIAL_LOCATOR, initialLocatorJson)
                }
            }
        }
    }
}
