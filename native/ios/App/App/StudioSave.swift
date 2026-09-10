import Foundation
import Capacitor
import Photos
import ImageIO

// Add-only Photos access. No photo reads, share sheet or destination integration.
@objc(StudioSave)
public class StudioSave: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StudioSave"
    public let jsName = "StudioSave"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let encoded = call.getString("base64"), encoded.count <= 24_000_000,
              let data = Data(base64Encoded: encoded), data.count <= 16 * 1024 * 1024,
              data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              image.width == 1080, image.height == 1920 else {
            call.reject("A 1080x1920 Studio PNG is required.")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photos permission was denied. Allow adding photos in Settings to save.")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = "boneheadz-studio.png"
                request.addResource(with: .photo, data: data, options: options)
            }) { success, error in
                if success { call.resolve(["saved": true]) }
                else { call.reject(error?.localizedDescription ?? "The image could not be saved.") }
            }
        }
    }
}
