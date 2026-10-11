import Foundation
import Tauri
import UIKit

private struct SaveArgs: Decodable {
    let path: String
    let filename: String
}

final class NativeSavePlugin: Plugin, UIDocumentPickerDelegate {
    private var pending: Invoke?

    @objc public func save(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SaveArgs.self)
        let source = URL(fileURLWithPath: args.path).standardizedFileURL.resolvingSymlinksInPath()
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("top.szlh.collage")
            .appendingPathComponent("exports").standardizedFileURL.resolvingSymlinksInPath()
        guard source.path.hasPrefix(cache.path + "/"), FileManager.default.fileExists(atPath: source.path) else {
            invoke.reject("Invalid staged export")
            return
        }
        DispatchQueue.main.async {
            guard self.pending == nil else {
                invoke.reject("Another export is already in progress")
                return
            }
            guard let controller = self.manager.viewController, controller.presentedViewController == nil else {
                invoke.reject("The export picker cannot be presented while another native screen is open")
                return
            }
            self.pending = invoke
            // iOS exports the fully written source file, not an empty placeholder or a returned URL
            // that would require security-scoped access after the picker has already finished.
            let picker = UIDocumentPickerViewController(forExporting: [source], asCopy: true)
            picker.delegate = self
            picker.modalPresentationStyle = .fullScreen
            controller.present(picker, animated: true)
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let invoke = pending else { return }
        pending = nil
        if urls.isEmpty {
            invoke.reject("The export picker did not return a destination")
        } else {
            invoke.resolve(["status": "saved"])
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let invoke = pending else { return }
        pending = nil
        invoke.resolve(["status": "cancelled"])
    }
}

@_cdecl("init_plugin_native_save")
func initPlugin() -> Plugin {
    NativeSavePlugin()
}
