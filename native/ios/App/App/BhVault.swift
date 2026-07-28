import Foundation
import Capacitor
import Security

/// Boneheadz Gym keychain vault.
/// Stores the account identity bundle (ECDSA signing key + AES backup key) in the
/// iOS keychain. Keychain items are NOT removed when an app is deleted and persist
/// across reinstalls for the same Apple team, so a wiped WebView container / fresh
/// install can recover the SAME account and decrypt its encrypted cloud backup
/// instead of silently starting over empty. Values are opaque JSON strings.
/// Methods:
///   set({key, value}) -> { ok }
///   get({key})        -> { value }   (value is null when absent)
///   remove({key})     -> { ok }
@objc(BhVault)
public class BhVault: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BhVault"
    public let jsName = "BhVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.boneheadz.gym.vault"

    private func baseQuery(_ key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"),
              let value = call.getString("value"),
              let data = value.data(using: .utf8) else {
            call.reject("key and value required")
            return
        }
        var q = baseQuery(key)
        SecItemDelete(q as CFDictionary) // overwrite any existing item
        q[kSecValueData as String] = data
        // AfterFirstUnlock: readable in the background after the first unlock,
        // and it persists across reinstalls. NOT ThisDeviceOnly, so it can also
        // ride an encrypted iCloud/device backup to a new phone.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve(["ok": true])
        } else {
            call.reject("keychain set failed: \(status)")
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key required")
            return
        }
        var q = baseQuery(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecSuccess, let data = out as? Data, let s = String(data: data, encoding: .utf8) {
            call.resolve(["value": s, "error": NSNull()])
        } else if status == errSecItemNotFound {
            // Genuinely nothing stored. Only this case may be read as "new device".
            call.resolve(["value": NSNull(), "error": NSNull()])
        } else {
            // Locked keychain, entitlement problem, anything else: we DO NOT KNOW.
            // Reporting that as empty is how the caller mints a fresh identity and
            // then overwrites a perfectly good key with it.
            call.resolve(["value": NSNull(), "error": "keychain read failed: \(status)"])
        }
    }

    /// What is actually true on this phone, so Settings can state it rather than
    /// assume it. Mirrors the Android status(); the keychain has no cloud-encryption
    /// toggle to report, so e2e is always true here (iCloud Keychain is encrypted).
    @objc func status(_ call: CAPPluginCall) {
        var q = baseQuery("identity")
        q[kSecReturnData as String] = false
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        let st = SecItemCopyMatching(q as CFDictionary, nil)
        var out: [String: Any] = ["available": true, "e2e": true, "hasIdentity": st == errSecSuccess]
        if st != errSecSuccess && st != errSecItemNotFound { out["readError"] = "keychain status \(st)" }
        call.resolve(out)
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key required")
            return
        }
        SecItemDelete(baseQuery(key) as CFDictionary)
        call.resolve(["ok": true])
    }
}
