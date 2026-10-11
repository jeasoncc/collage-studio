package top.szlh.collage.export

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors

@InvokeArg
class SaveArgs {
    lateinit var path: String
    lateinit var filename: String
}

@TauriPlugin
class NativeSavePlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()
    private var source: File? = null

    @Command
    fun save(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SaveArgs::class.java)
            val file = File(args.path).canonicalFile
            val cache = File(activity.cacheDir, "exports").canonicalFile
            // Rust is the only caller: no frontend-provided path or destination URI is accepted.
            if (!file.path.startsWith(cache.path + File.separator) || !file.isFile) {
                invoke.reject("Invalid staged export")
                return
            }
            Handler(Looper.getMainLooper()).post {
                if (source != null) {
                    invoke.reject("Another export is already in progress")
                } else {
                    source = file
                    try {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(args.filename.substringAfterLast('.', "").lowercase())
                                ?: "application/octet-stream"
                            putExtra(Intent.EXTRA_TITLE, args.filename)
                        }
                        startActivityForResult(invoke, intent, "saveResult")
                    } catch (error: Exception) {
                        source = null
                        invoke.reject(error.message ?: "Unable to open save destination picker")
                    }
                }
            }
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Unable to prepare export")
        }
    }

    @ActivityCallback
    fun saveResult(invoke: Invoke, result: ActivityResult) {
        val file = source
        source = null
        if (result.resultCode == Activity.RESULT_CANCELED) {
            invoke.resolve(JSObject().put("status", "cancelled"))
            return
        }
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null || file == null) {
            invoke.reject("The destination picker did not return a writable document")
            return
        }
        io.execute {
            try {
                val output = activity.contentResolver.openOutputStream(uri, "wt")
                    ?: throw java.io.IOException("The selected destination is not writable")
                output.use { destination ->
                    file.inputStream().use { input -> input.copyTo(destination, 64 * 1024) }
                    destination.flush()
                }
                invoke.resolve(JSObject().put("status", "saved"))
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Unable to write the selected destination")
            }
        }
    }
}
