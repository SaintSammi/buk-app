package expo.modules.bukreadium

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BukReadiumModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BukReadium")

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
        }
    }
}
