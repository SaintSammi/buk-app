package expo.modules.bukepubreader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BukEpubReaderModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BukEpubReader")

        View(BukEpubWebView::class) {
            Events("onBukMessage", "onBukTap")

            /** file:// URI of the assembled epub.js HTML template */
            Prop("src") { view: BukEpubWebView, src: String ->
                view.loadSrc(src)
            }

            /**
             * JSON string {"id": <timestamp>, "script": "<js to evaluate>"}.
             * The view executes the script each time the id changes.
             * Use this to drive navigation: rendition.next(), rendition.prev(),
             * rendition.display(cfi), etc.
             */
            Prop("injectJS") { view: BukEpubWebView, json: String? ->
                view.handleInjectJS(json)
            }
        }
    }
}
