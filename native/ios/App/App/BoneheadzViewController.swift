import UIKit
import Capacitor

/// Registers Boneheadz custom plugins with the Capacitor bridge.
/// Capacitor 8 does NOT auto-discover plugins compiled into the app target:
/// every hand-written plugin needs its line here, per platform. BhVault was
/// compiled in but never registered (found by Walt, 2026-08-10), so iOS kept
/// no keychain mirror and a reinstall minted a fresh empty account instead of
/// recovering; Android has registered it all along (MainActivity.java).
class BoneheadzViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthPlugin())
        bridge?.registerPluginInstance(BhVault())
    }
}
