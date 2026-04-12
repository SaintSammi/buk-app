package expo.modules.bukreadium

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.readium.r2.shared.util.toAbsoluteUrl
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.getOrElse
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.publication.services.cover
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser
import java.io.File
import java.io.FileOutputStream

private const val TAG = "BukReadiumModule"

class BukReadiumModule : Module() {
    private val moduleScope = CoroutineScope(Dispatchers.Main)

    override fun definition() = ModuleDefinition {
        Name("BukReadium")

        AsyncFunction("extractEpubCover") { src: String, promise: Promise ->
            val context: Context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("E_NO_CONTEXT", "No React context", null)

            moduleScope.launch {
                try {
                    val httpClient = DefaultHttpClient()
                    val assetRetriever = AssetRetriever(context.contentResolver, httpClient)
                    val opener = PublicationOpener(
                        publicationParser = DefaultPublicationParser(
                            context = context,
                            httpClient = httpClient,
                            assetRetriever = assetRetriever,
                            pdfFactory = null
                        )
                    )

                    val url = android.net.Uri.parse(src).toAbsoluteUrl()
                        ?: return@launch promise.reject("E_BAD_URI", "Cannot parse URI: $src", null)

                    val asset = assetRetriever.retrieve(url).getOrElse {
                        return@launch promise.reject("E_ASSET", "Cannot retrieve asset: $it", null)
                    }

                    val publication = opener.open(asset, allowUserInteraction = false).getOrElse {
                        asset.close()
                        return@launch promise.reject("E_OPEN", "Cannot open publication: $it", null)
                    }

                    // Readium provides the cover as a Bitmap via the cover service
                    val bitmap: Bitmap? = withContext(Dispatchers.IO) {
                        publication.cover()
                    }

                    publication.close()

                    if (bitmap == null) {
                        return@launch promise.resolve(null)
                    }

                    // Write the bitmap to the app cache directory
                    val cacheDir = File(context.cacheDir, "epub-covers").also { it.mkdirs() }
                    val outFile = File(cacheDir, "${src.hashCode()}.jpg")
                    withContext(Dispatchers.IO) {
                        FileOutputStream(outFile).use { fos ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                        }
                    }

                    promise.resolve("file://${outFile.absolutePath}")
                } catch (e: Exception) {
                    Log.e(TAG, "extractEpubCover failed", e)
                    promise.resolve(null) // Non-fatal — fall back to default cover
                }
            }
        }

        View(BukReadiumView::class) {
            Events("onBukReady", "onBukLocation", "onBukTap", "onBukError")

            /**
             * file:// or content:// URI of the publication to open.
             * Changing this prop closes the current publication and opens a new one.
             */
            Prop("src") { view: BukReadiumView, src: String ->
                view.openPublication(src)
            }

            /**
             * Serialised Readium Locator JSON for restoring a saved reading position.
             * Must be provided before or simultaneously with `src`.
             */
            Prop("initialLocator") { view: BukReadiumView, locator: String? ->
                view.setInitialLocator(locator)
            }

            /**
             * Serialised BukReadiumPreferences JSON.
             * Applied live — navigator re-renders without reloading the publication.
             */
            Prop("preferences") { view: BukReadiumView, prefs: String? ->
                view.applyPreferences(prefs)
            }

            /**
             * Serialised navigation command JSON: {id, type, locator?}
             * Bump the `id` to re-issue the same command type.
             */
            Prop("command") { view: BukReadiumView, cmd: String? ->
                view.handleCommand(cmd)
            }

            /**
             * Top inset in logical dp (CSS pixels). Pushes the Readium content area down
             * so text starts below the header overlay without moving the view's frame.
             */
            Prop("contentInsetTop") { view: BukReadiumView, insetDp: Double? ->
                view.setContentInsetTop(insetDp?.toFloat() ?: 0f)
            }
        }
    }
}
