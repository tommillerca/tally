package com.boneheadz.gym

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.BlockstoreClient
import com.google.android.gms.auth.blockstore.DeleteBytesRequest
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability

/**
 * Boneheadz Gym identity vault, Android side. The twin of iOS BhVault.swift, and
 * deliberately the SAME JS surface (set/get/remove) so js/social.js needs no
 * per-platform branching.
 *
 * Why it exists: uninstalling an Android app wipes both the data directory and
 * the Android Keystore, so the AES key that decrypts the encrypted cloud backup
 * would go with it. That is exactly the state that destroyed a real account on
 * 2026-07-27.
 *
 * Backed by Play Services Block Store, which is the closest thing Android has to
 * the iOS keychain, but is NOT the same guarantee and must not be described as
 * one:
 *   - it only survives uninstall when the user has Settings > Google > Backup on
 *   - it is wiped if the user clears Play Services storage
 *   - cloud (new device) copies are only end-to-end encrypted on Android 9+ WITH
 *     a screen lock set
 * status() reports which of those are actually true on this phone so the UI can
 * tell the player the truth instead of implying protection it does not have. The
 * recovery phrase, not this, is the real safety net.
 */
@CapacitorPlugin(name = "BhVault")
class BhVault : Plugin() {

    // Block Store caps an entry at 4 KB. The identity bundle is ~1 KB, but a
    // silent truncation would store a key that decrypts nothing, so refuse loudly.
    private val maxBytes = 4000

    private fun client(): BlockstoreClient = Blockstore.getClient(context)

    private fun playServicesReason(): String? {
        val code = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
        return if (code == ConnectionResult.SUCCESS) null
        else "Google Play services unavailable (code $code)"
    }

    /**
     * Read one key. `err` non-null means WE COULD NOT TELL, which is a different
     * thing from "nothing is stored" and must never be collapsed into it: the
     * caller mints a fresh identity when the vault is empty, so reporting a failed
     * read as empty is how a good key gets replaced by a new one.
     */
    private fun readOne(key: String, done: (bytes: ByteArray?, err: String?) -> Unit) {
        val req = RetrieveBytesRequest.Builder().setKeys(listOf(key)).build()
        client().retrieveBytes(req)
            .addOnSuccessListener { res -> done(res.blockstoreDataMap[key]?.bytes, null) }
            .addOnFailureListener { e -> done(null, e.message ?: "block store read failed") }
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key required")
        val value = call.getString("value") ?: return call.reject("value required")
        playServicesReason()?.let { return call.reject(it) }
        val bytes = value.toByteArray(Charsets.UTF_8)
        if (bytes.size > maxBytes) {
            return call.reject("value is ${bytes.size} bytes; Block Store caps one entry at $maxBytes")
        }
        // Read before writing. Every storeBytes call re-decides the cloud-backup
        // flag, and a call made with the flag off DELETES the existing cloud copy
        // on the next sync. Skipping no-op writes keeps that window as small as
        // possible, since the identity bundle is written rarely and rarely changes.
        readOne(key) { existing, err ->
            if (err != null) return@readOne call.reject("could not read the vault before writing: $err")
            if (existing != null && existing.contentEquals(bytes)) {
                return@readOne call.resolve(JSObject().put("ok", true))
            }
            // Cloud backup is only worth enabling when it will be end-to-end
            // encrypted; Google's own guidance is to check first. If the check
            // itself fails, still store locally: a current local copy beats a
            // stale one, and the phrase covers the off-device case.
            client().isEndToEndEncryptionAvailable()
                .addOnSuccessListener { e2e -> store(call, key, bytes, e2e) }
                .addOnFailureListener { store(call, key, bytes, false) }
        }
    }

    private fun store(call: PluginCall, key: String, bytes: ByteArray, cloud: Boolean) {
        val data = StoreBytesData.Builder()
            .setBytes(bytes)
            .setKey(key)                       // singular here; RetrieveBytesRequest takes a list
            .setShouldBackupToCloud(cloud)
            .build()
        client().storeBytes(data)
            .addOnSuccessListener { call.resolve(JSObject().put("ok", true)) }
            .addOnFailureListener { e -> call.reject("block store set failed: ${e.message}") }
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key required")
        playServicesReason()?.let {
            return call.resolve(JSObject().put("value", null).put("error", it))
        }
        readOne(key) { b, err ->
            // `error` present means unknown, NOT empty. The JS side must not treat
            // it as "no account here" and mint a replacement.
            call.resolve(JSObject().put("value", b?.toString(Charsets.UTF_8)).put("error", err))
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("key required")
        // Matches set(): an unavailable vault is a failure, not a success. Resolving
        // ok:true here reported a delete that never happened, and the caller is the
        // "Erase ALL data" path, so the identity it thought it erased is still in
        // Block Store waiting to re-adopt the account.
        playServicesReason()?.let { return call.reject(it) }
        val req = DeleteBytesRequest.Builder().setKeys(listOf(key)).build()
        client().deleteBytes(req)
            .addOnSuccessListener { call.resolve(JSObject().put("ok", true)) }
            .addOnFailureListener { e -> call.reject("block store remove failed: ${e.message}") }
    }

    /**
     * What is ACTUALLY true on this phone. Drives the Settings account-safety row
     * and the boot canary, so "your account is protected" is a measurement rather
     * than an assumption.
     */
    @PluginMethod
    fun status(call: PluginCall) {
        val out = JSObject()
        val reason = playServicesReason()
        if (reason != null) {
            call.resolve(out.put("available", false).put("e2e", false)
                .put("hasIdentity", false).put("reason", reason))
            return
        }
        out.put("available", true)
        readOne("identity") { id, err ->
            out.put("hasIdentity", id != null)
            if (err != null) out.put("readError", err)
            client().isEndToEndEncryptionAvailable()
                .addOnSuccessListener { e2e ->
                    out.put("e2e", e2e)
                    out.put("reason", if (e2e) null else "No screen lock, so an off-device copy cannot be encrypted")
                    call.resolve(out)
                }
                .addOnFailureListener { e ->
                    call.resolve(out.put("e2e", false).put("reason", "Could not read encryption state: ${e.message}"))
                }
        }
    }
}
