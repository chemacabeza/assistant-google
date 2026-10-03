package com.assistant.util;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Encrypts OAuth tokens before they are stored in PostgreSQL.
 *
 * New values are written as {@code v2:} + Base64(IV || AES-GCM ciphertext). GCM gives
 * each value a random IV (so equal plaintexts no longer produce equal ciphertexts) and
 * an authentication tag (so a tampered row fails to decrypt instead of yielding garbage).
 *
 * Values without the prefix were written by the previous AES/ECB implementation and are
 * still decrypted, so existing rows keep working; they are re-encrypted with GCM the next
 * time they are saved.
 */
@Component
public class CryptoUtil {

    private static final String ALGORITHM = "AES";
    private static final String LEGACY_TRANSFORMATION = "AES"; // AES/ECB/PKCS5Padding
    private static final String GCM_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String GCM_PREFIX = "v2:";
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static String secretKey;

    @Value("${app.encryption-key}")
    public void setSecretKey(String key) {
        int length = key == null ? 0 : key.getBytes(StandardCharsets.UTF_8).length;
        if (length != 16 && length != 24 && length != 32) {
            throw new IllegalStateException(
                "TOKEN_ENCRYPTION_KEY must be exactly 16, 24 or 32 bytes long, got " + length);
        }
        CryptoUtil.secretKey = key;
    }

    public static String encrypt(String value) {
        if (value == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_BYTES];
            RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(GCM_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

            byte[] out = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ciphertext, 0, out, iv.length, ciphertext.length);
            return GCM_PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new RuntimeException("Error encrypting data", e);
        }
    }

    public static String decrypt(String encryptedValue) {
        if (encryptedValue == null) return null;
        try {
            if (encryptedValue.startsWith(GCM_PREFIX)) {
                return decryptGcm(encryptedValue.substring(GCM_PREFIX.length()));
            }
            return decryptLegacy(encryptedValue);
        } catch (Exception e) {
            throw new RuntimeException("Error decrypting data", e);
        }
    }

    private static String decryptGcm(String base64) throws Exception {
        byte[] in = Base64.getDecoder().decode(base64);
        if (in.length < GCM_IV_BYTES + GCM_TAG_BITS / 8) {
            throw new IllegalArgumentException("Ciphertext too short");
        }
        Cipher cipher = Cipher.getInstance(GCM_TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, keySpec(), new GCMParameterSpec(GCM_TAG_BITS, in, 0, GCM_IV_BYTES));
        byte[] plaintext = cipher.doFinal(in, GCM_IV_BYTES, in.length - GCM_IV_BYTES);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private static String decryptLegacy(String base64) throws Exception {
        Cipher cipher = Cipher.getInstance(LEGACY_TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, keySpec());
        byte[] plaintext = cipher.doFinal(Base64.getDecoder().decode(base64));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private static SecretKeySpec keySpec() {
        return new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }
}
