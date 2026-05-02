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
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.services.search.search
import org.readium.r2.shared.util.toAbsoluteUrl
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.getOrElse
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.publication.services.cover
import org.readium.r2.shared.publication.services.positions
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

        AsyncFunction("extractEpubMetadata") { src: String, promise: Promise ->
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

                    val metadata = mapOf(
                        "title" to publication.metadata.title,
                        "authors" to publication.metadata.authors.joinToString(", ") { it.name },
                        "publisher" to publication.metadata.publishers.joinToString(", ") { it.name },
                        "description" to publication.metadata.description,
                        "language" to publication.metadata.languages.firstOrNull(),
                        "identifier" to publication.metadata.identifier,
                        "series" to publication.metadata.belongsTo["series"]?.firstOrNull()?.name,
                        "published" to publication.metadata.published?.toString()
                    )

                    publication.close()
                    promise.resolve(metadata)
                } catch (e: Exception) {
                    Log.e(TAG, "extractEpubMetadata failed", e)
                    promise.resolve(null)
                }
            }
        }

        AsyncFunction("extractEpubToc") { src: String, promise: Promise ->
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

                    // Apply the same navigator configuration as the live reader so that
                    // publication.positions() uses the exact same positions service.
                    // EpubNavigatorFactory modifies the publication's servicesBuilder in-place;
                    // without this, positions() returns a different count and all page numbers
                    // are off by a small but consistent amount.
                    @OptIn(ExperimentalReadiumApi::class)
                    try {
                        EpubNavigatorFactory(
                            publication = publication,
                            configuration = EpubNavigatorFactory.Configuration(defaults = EpubDefaults())
                        )
                    } catch (_: Exception) {}

                    val allPositions = try {
                        publication.positions()
                    } catch (e: Exception) {
                        emptyList<org.readium.r2.shared.publication.Locator>()
                    }

                    val toc = publication.tableOfContents.map { tocEntry ->
                        val hrefStr = tocEntry.href.toString()
                        val hrefBase = hrefStr.split("#")[0]

                        // Find the first position whose href matches this chapter href.
                        // Position hrefs are absolute (e.g. epub://id/OEBPS/ch1.xhtml)
                        // while TOC hrefs may be relative (e.g. OEBPS/ch1.xhtml), so
                        // we use endsWith for matching.
                        val matchingPos = allPositions.firstOrNull { pos ->
                            val posHref = pos.href.toString().split("#")[0]
                            posHref == hrefBase || posHref.endsWith("/$hrefBase")
                        }

                        val locJson = org.json.JSONObject().apply {
                            // Use the position's absolute href if found — relative hrefs
                            // cause Locator.fromJSON to return null, breaking goto.
                            val resolvedHref = matchingPos?.href?.toString() ?: hrefStr
                            put("href", resolvedHref)
                            put("type", "application/xhtml+xml")
                            if (tocEntry.title != null) put("title", tocEntry.title)
                            if (matchingPos != null) {
                                val locs = org.json.JSONObject()
                                matchingPos.locations.totalProgression?.let { tp ->
                                    locs.put("totalProgression", tp)
                                }
                                matchingPos.locations.position?.let { p ->
                                    locs.put("position", p)
                                }
                                put("locations", locs)
                            }
                        }.toString()
                        mapOf(
                            "title" to tocEntry.title,
                            "href" to hrefStr,
                            "locator" to locJson
                        )
                    }

                    publication.close()
                    promise.resolve(toc)
                } catch (e: Exception) {
                    Log.e(TAG, "extractEpubToc failed", e)
                    promise.resolve(null)
                }
            }
        }

        AsyncFunction("searchEpub") { src: String, query: String, promise: Promise ->
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

                    @OptIn(ExperimentalReadiumApi::class)
                    val iterator = publication.search(query)

                    val results = org.json.JSONArray()

                    if (iterator != null) {
                        var count = 0
                        while (count < 100) {
                            val page = iterator.next().getOrNull() ?: break
                            for (locator in page.locators) {
                                val before = locator.text.before?.takeLast(60) ?: ""
                                val highlight = locator.text.highlight ?: ""
                                val after = locator.text.after?.take(60) ?: ""
                                val snippet = "$before$highlight$after".trim()

                                val locJson = org.json.JSONObject().apply {
                                    put("href", locator.href.toString())
                                    put("type", "application/xhtml+xml")
                                    val locs = org.json.JSONObject()
                                    locator.locations.totalProgression?.let { locs.put("totalProgression", it) }
                                    locator.locations.position?.let { locs.put("position", it) }
                                    locator.locations.progression?.let { locs.put("progression", it) }
                                    if (locs.length() > 0) put("locations", locs)
                                    val text = org.json.JSONObject()
                                    if (before.isNotEmpty()) text.put("before", before)
                                    if (highlight.isNotEmpty()) text.put("highlight", highlight)
                                    if (after.isNotEmpty()) text.put("after", after)
                                    if (text.length() > 0) put("text", text)
                                }

                                val item = org.json.JSONObject().apply {
                                    put("locator", locJson.toString())
                                    put("snippet", snippet)
                                    put("chapterTitle", locator.title ?: "")
                                }
                                results.put(item)
                                count++
                            }
                        }
                        iterator.close()
                    }

                    publication.close()

                    // Convert JSONArray to List<Map<String,Any?>> for Expo bridge
                    val list = (0 until results.length()).map { i ->
                        val obj = results.getJSONObject(i)
                        mapOf(
                            "locator" to obj.getString("locator"),
                            "snippet" to obj.getString("snippet"),
                            "chapterTitle" to obj.getString("chapterTitle")
                        )
                    }
                    promise.resolve(list)
                } catch (e: Exception) {
                    Log.e(TAG, "searchEpub failed", e)
                    promise.resolve(emptyList<Map<String, Any?>>())
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
