import UIKit
import Capacitor

/// Registers Boneheadz custom plugins with the Capacitor bridge.
class BoneheadzViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthPlugin())
    }
}
