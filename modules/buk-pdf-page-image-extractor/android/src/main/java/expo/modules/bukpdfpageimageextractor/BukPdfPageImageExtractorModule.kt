package expo.modules.bukpdfpageimageextractor

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

class BukPdfPageImageExtractorModule : Module() {
  private data class DocumentHolder(
    val descriptor: ParcelFileDescriptor,
    val renderer: PdfRenderer
  )

  private val documents = ConcurrentHashMap<String, DocumentHolder>()

  override fun definition() = ModuleDefinition {
    Name("BukPdfPageImageExtractor")

    AsyncFunction("prepareDocument") { uriString: String ->
      val context = appContext.reactContext ?: throw Exception("react_context_unavailable")
      val uri = Uri.parse(uriString)

      val descriptor = tryOpenDescriptor(context, uri)
      val renderer = PdfRenderer(descriptor)
      val documentId = UUID.randomUUID().toString()

      documents[documentId] = DocumentHolder(descriptor, renderer)

      mapOf(
        "documentId" to documentId,
        "pageCount" to renderer.pageCount
      )
    }

    AsyncFunction("renderPageToImage") { params: Map<String, Any?> ->
      val context = appContext.reactContext ?: throw Exception("react_context_unavailable")

      val documentId = params["documentId"] as? String ?: throw Exception("missing_document_id")
      val page = (params["page"] as? Number)?.toInt() ?: throw Exception("missing_page")
      val width = (params["width"] as? Number)?.toInt() ?: throw Exception("missing_width")
      val height = (params["height"] as? Number)?.toInt() ?: throw Exception("missing_height")
      val quality = ((params["quality"] as? Number)?.toInt() ?: 90).coerceIn(40, 100)

      val holder = documents[documentId] ?: throw Exception("document_not_found")
      val renderer = holder.renderer

      if (page < 1 || page > renderer.pageCount) {
        throw Exception("page_out_of_range")
      }

      val outputWidth = max(1, width)
      val outputHeight = max(1, height)

      val outputBitmap = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(outputBitmap)
      canvas.drawColor(Color.BLACK)

      val pageIndex = page - 1
      var pdfPage: PdfRenderer.Page? = null

      try {
        pdfPage = renderer.openPage(pageIndex)

        val srcWidth = max(1, pdfPage.width)
        val srcHeight = max(1, pdfPage.height)

        val scale = minOf(outputWidth.toFloat() / srcWidth.toFloat(), outputHeight.toFloat() / srcHeight.toFloat())
        val renderWidth = max(1, (srcWidth * scale).toInt())
        val renderHeight = max(1, (srcHeight * scale).toInt())
        val offsetX = (outputWidth - renderWidth) / 2
        val offsetY = (outputHeight - renderHeight) / 2

        val renderBitmap = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888)

        pdfPage.render(renderBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
        canvas.drawBitmap(renderBitmap, offsetX.toFloat(), offsetY.toFloat(), null)
        renderBitmap.recycle()
      } finally {
        pdfPage?.close()
      }

      val outputDir = File(context.cacheDir, "buk-page-images")
      if (!outputDir.exists()) {
        outputDir.mkdirs()
      }

      val outputFile = File(outputDir, "$documentId-p$page-${System.currentTimeMillis()}.jpg")
      FileOutputStream(outputFile).use { stream ->
        outputBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
      }
      outputBitmap.recycle()

      mapOf("uri" to "file://${outputFile.absolutePath}")
    }

    AsyncFunction("disposeDocument") { documentId: String ->
      val holder = documents.remove(documentId) ?: return@AsyncFunction
      try {
        holder.renderer.close()
      } catch (_: Throwable) {
      }
      try {
        holder.descriptor.close()
      } catch (_: Throwable) {
      }
    }

    OnDestroy {
      documents.forEach { (_, holder) ->
        try {
          holder.renderer.close()
        } catch (_: Throwable) {
        }
        try {
          holder.descriptor.close()
        } catch (_: Throwable) {
        }
      }
      documents.clear()
    }
  }

  private fun tryOpenDescriptor(context: android.content.Context, uri: Uri): ParcelFileDescriptor {
    return try {
      context.contentResolver.openFileDescriptor(uri, "r") ?: throw Exception("open_descriptor_failed")
    } catch (_: Throwable) {
      if ("file" != uri.scheme) {
        throw Exception("open_descriptor_failed")
      }

      val path = uri.path ?: throw Exception("missing_file_path")
      val file = File(path)
      if (!file.exists()) {
        throw Exception("file_not_found")
      }

      ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }
  }
}
