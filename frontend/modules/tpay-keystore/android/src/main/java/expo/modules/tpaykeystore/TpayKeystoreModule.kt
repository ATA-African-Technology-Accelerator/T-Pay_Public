package expo.modules.tpaykeystore

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

private const val PROVIDER = "AndroidKeyStore"

class KeyMissingException(alias: String) : CodedException("KEY_MISSING", "No key named $alias", null)

/**
 * Keeps the device signing key inside the Android Keystore, in StrongBox when the phone has it.
 * The private key never leaves the chip: JavaScript only gets the public key and signatures.
 */
class TpayKeystoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TpayKeystore")

    AsyncFunction("hasKey") { alias: String -> store().containsAlias(alias) }

    // Returns the public key as X.509 SubjectPublicKeyInfo in standard base64.
    AsyncFunction("generateKey") { alias: String ->
      if (store().containsAlias(alias)) store().deleteEntry(alias)
      val strongBox = hasStrongBox()
      try {
        generate(alias, strongBox)
      } catch (e: StrongBoxUnavailableException) {
        generate(alias, false)
      }
      describe(alias)
    }

    AsyncFunction("describeKey") { alias: String -> describe(alias) }

    // Signs the UTF-8 bytes of the message with SHA-256 ECDSA. Returns a DER signature in base64.
    AsyncFunction("sign") { alias: String, message: String ->
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(privateKey(alias))
      signer.update(message.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
    }

    AsyncFunction("deleteKey") { alias: String ->
      if (store().containsAlias(alias)) store().deleteEntry(alias)
    }
  }

  private fun store(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

  private fun hasStrongBox(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    val context = appContext.reactContext ?: return false
    return context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
  }

  private fun generate(alias: String, strongBox: Boolean) {
    val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) spec.setIsStrongBoxBacked(true)
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER).run {
      initialize(spec.build())
      generateKeyPair()
    }
  }

  private fun privateKey(alias: String): PrivateKey =
    store().getKey(alias, null) as? PrivateKey ?: throw KeyMissingException(alias)

  private fun describe(alias: String): Map<String, Any> {
    val entry = store().getCertificate(alias) ?: throw KeyMissingException(alias)
    return mapOf(
      "publicKey" to Base64.encodeToString(entry.publicKey.encoded, Base64.NO_WRAP),
      "location" to location(privateKey(alias)),
    )
  }

  @Suppress("DEPRECATION")
  private fun location(key: PrivateKey): String {
    val info = KeyFactory.getInstance(key.algorithm, PROVIDER).getKeySpec(key, KeyInfo::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return when (info.securityLevel) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
        else -> "software"
      }
    }
    return if (info.isInsideSecureHardware) "tee" else "software"
  }
}
