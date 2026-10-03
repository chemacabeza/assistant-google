package com.assistant.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("CryptoUtil - Encryption and Decryption Tests")
class CryptoUtilTest {

    private static final String TEST_SECRET_KEY = "1234567890123456"; // 16 bytes for AES-128

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", TEST_SECRET_KEY);
    }

    @Test
    @DisplayName("Should encrypt a plain text string successfully")
    void testEncryptSuccess() {
        String encrypted = CryptoUtil.encrypt("TestData123");

        assertNotNull(encrypted);
        assertNotEquals("TestData123", encrypted);
        assertTrue(encrypted.startsWith("v2:"), "new ciphertexts carry the GCM version prefix");
    }

    @Test
    @DisplayName("Should decrypt an encrypted string back to original")
    void testDecryptSuccess() {
        String encrypted = CryptoUtil.encrypt("MySecretPassword");

        assertEquals("MySecretPassword", CryptoUtil.decrypt(encrypted));
    }

    @Test
    @DisplayName("Should handle null input in encrypt")
    void testEncryptWithNull() {
        assertNull(CryptoUtil.encrypt(null));
    }

    @Test
    @DisplayName("Should handle null input in decrypt")
    void testDecryptWithNull() {
        assertNull(CryptoUtil.decrypt(null));
    }

    @ParameterizedTest
    @DisplayName("Should handle various input strings")
    @ValueSource(strings = {
        "SimpleText",
        "WithNumbers123",
        "WithSpecialChars!@#$",
        "LongStringWithMultipleWordsAndNumbers12345",
        "unicode-テスト-文字",
        "ya29.a0AfH6SMBx-very-long-google-access-token-with-dashes_and_underscores-0123456789"
    })
    void testEncryptDecryptRoundTrip(String input) {
        String encrypted = CryptoUtil.encrypt(input);

        assertEquals(input, CryptoUtil.decrypt(encrypted));
        assertNotEquals(input, encrypted);
    }

    @Test
    @DisplayName("Encrypting the same text twice gives different ciphertexts (random IV)")
    void testEncryptIsNotDeterministic() {
        String encrypted1 = CryptoUtil.encrypt("ConsistencyTest");
        String encrypted2 = CryptoUtil.encrypt("ConsistencyTest");

        assertNotEquals(encrypted1, encrypted2);
        assertEquals("ConsistencyTest", CryptoUtil.decrypt(encrypted1));
        assertEquals("ConsistencyTest", CryptoUtil.decrypt(encrypted2));
    }

    @Test
    @DisplayName("Should handle empty string")
    void testEncryptEmptyString() {
        assertEquals("", CryptoUtil.decrypt(CryptoUtil.encrypt("")));
    }

    @Test
    @DisplayName("Should handle single character")
    void testEncryptSingleCharacter() {
        assertEquals("A", CryptoUtil.decrypt(CryptoUtil.encrypt("A")));
    }

    @Test
    @DisplayName("Should throw exception with invalid encrypted data")
    void testDecryptWithInvalidData() {
        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt("NotValidBase64OrEncrypted!@#$"));
        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt("v2:NotValidBase64OrEncrypted!@#$"));
        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt("v2:" + Base64.getEncoder().encodeToString(new byte[5])));
    }

    @Test
    @DisplayName("A tampered ciphertext is rejected instead of decrypting to garbage")
    void testTamperedCiphertextIsRejected() {
        String encrypted = CryptoUtil.encrypt("refresh-token-value");
        byte[] bytes = Base64.getDecoder().decode(encrypted.substring("v2:".length()));
        bytes[bytes.length - 1] ^= 0x01; // flip one bit in the ciphertext/tag
        String tampered = "v2:" + Base64.getEncoder().encodeToString(bytes);

        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt(tampered));
    }

    @Test
    @DisplayName("Ciphertext cannot be decrypted with a different key")
    void testWrongKeyIsRejected() {
        String encrypted = CryptoUtil.encrypt("secret");
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", "6543210987654321");

        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt(encrypted));
    }

    @Test
    @DisplayName("Values written by the previous AES/ECB implementation still decrypt")
    void testLegacyEcbCiphertextStillDecrypts() throws Exception {
        Cipher legacy = Cipher.getInstance("AES"); // AES/ECB/PKCS5Padding, as before
        legacy.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(TEST_SECRET_KEY.getBytes(StandardCharsets.UTF_8), "AES"));
        String legacyCiphertext = Base64.getEncoder().encodeToString(
                legacy.doFinal("legacy-stored-token".getBytes(StandardCharsets.UTF_8)));
        assertFalse(legacyCiphertext.startsWith("v2:"));

        assertEquals("legacy-stored-token", CryptoUtil.decrypt(legacyCiphertext));
    }

    @Test
    @DisplayName("Should throw exception when secret key is null")
    void testEncryptWithNullSecretKey() {
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", null);

        assertThrows(RuntimeException.class, () -> CryptoUtil.encrypt("test"));
    }

    @Test
    @DisplayName("Payload after the version prefix is valid Base64")
    void testBase64Encoding() {
        String encrypted = CryptoUtil.encrypt("BaseEncodingTest");

        assertDoesNotThrow(() -> Base64.getDecoder().decode(encrypted.substring("v2:".length())));
    }

    @ParameterizedTest
    @DisplayName("Keys of 16, 24 and 32 bytes are accepted")
    @ValueSource(strings = {"1234567890123456", "123456789012345678901234", "12345678901234567890123456789012"})
    void testValidKeyLengthsAreAccepted(String key) {
        CryptoUtil util = new CryptoUtil();

        assertDoesNotThrow(() -> util.setSecretKey(key));
        assertEquals("ok", CryptoUtil.decrypt(CryptoUtil.encrypt("ok")));
    }

    @ParameterizedTest
    @DisplayName("Keys of any other length are rejected at startup with a clear message")
    @ValueSource(strings = {"", "short", "12345678901234567", "this-key-is-way-too-long-for-aes-at-all"})
    void testInvalidKeyLengthsAreRejected(String key) {
        CryptoUtil util = new CryptoUtil();

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> util.setSecretKey(key));
        assertTrue(ex.getMessage().contains("TOKEN_ENCRYPTION_KEY"));
    }

    @Test
    @DisplayName("A null key is rejected at startup")
    void testNullKeyIsRejected() {
        assertThrows(IllegalStateException.class, () -> new CryptoUtil().setSecretKey(null));
    }
}
