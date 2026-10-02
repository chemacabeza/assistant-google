package com.assistant.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("CryptoUtil - Encryption and Decryption Tests")
class CryptoUtilTest {

    private CryptoUtil cryptoUtil;
    private static final String TEST_SECRET_KEY = "1234567890123456"; // 16 bytes for AES

    @BeforeEach
    void setUp() {
        cryptoUtil = new CryptoUtil();
        // Set the secret key via reflection since it's injected
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", TEST_SECRET_KEY);
    }

    @Test
    @DisplayName("Should encrypt a plain text string successfully")
    void testEncryptSuccess() {
        // Arrange
        String plainText = "TestData123";

        // Act
        String encrypted = CryptoUtil.encrypt(plainText);

        // Assert
        assertNotNull(encrypted);
        assertNotEquals(plainText, encrypted);
        assertTrue(encrypted.length() > 0);
    }

    @Test
    @DisplayName("Should decrypt an encrypted string back to original")
    void testDecryptSuccess() {
        // Arrange
        String plainText = "MySecretPassword";
        String encrypted = CryptoUtil.encrypt(plainText);

        // Act
        String decrypted = CryptoUtil.decrypt(encrypted);

        // Assert
        assertEquals(plainText, decrypted);
    }

    @Test
    @DisplayName("Should handle null input in encrypt")
    void testEncryptWithNull() {
        // Arrange & Act
        String result = CryptoUtil.encrypt(null);

        // Assert
        assertNull(result);
    }

    @Test
    @DisplayName("Should handle null input in decrypt")
    void testDecryptWithNull() {
        // Arrange & Act
        String result = CryptoUtil.decrypt(null);

        // Assert
        assertNull(result);
    }

    @ParameterizedTest
    @DisplayName("Should handle various input strings")
    @ValueSource(strings = {
        "SimpleText",
        "WithNumbers123",
        "WithSpecialChars!@#$",
        "LongStringWithMultipleWordsAndNumbers12345",
        "unicode-テスト-文字"
    })
    void testEncryptDecryptRoundTrip(String input) {
        // Act
        String encrypted = CryptoUtil.encrypt(input);
        String decrypted = CryptoUtil.decrypt(encrypted);

        // Assert
        assertEquals(input, decrypted);
        assertNotEquals(input, encrypted); // Should be different
    }

    @Test
    @DisplayName("Should encrypt same text to potentially different results (due to padding)")
    void testEncryptConsistency() {
        // Arrange
        String plainText = "ConsistencyTest";

        // Act
        String encrypted1 = CryptoUtil.encrypt(plainText);
        String encrypted2 = CryptoUtil.encrypt(plainText);

        // Assert - In ECB mode without IV, same plaintext should produce same ciphertext
        assertEquals(encrypted1, encrypted2);
    }

    @Test
    @DisplayName("Should handle empty string")
    void testEncryptEmptyString() {
        // Arrange & Act
        String encrypted = CryptoUtil.encrypt("");
        String decrypted = CryptoUtil.decrypt(encrypted);

        // Assert
        assertEquals("", decrypted);
    }

    @Test
    @DisplayName("Should handle single character")
    void testEncryptSingleCharacter() {
        // Arrange & Act
        String encrypted = CryptoUtil.encrypt("A");
        String decrypted = CryptoUtil.decrypt(encrypted);

        // Assert
        assertEquals("A", decrypted);
    }

    @Test
    @DisplayName("Should throw exception with invalid encrypted data")
    void testDecryptWithInvalidData() {
        // Arrange
        String invalidEncryptedData = "NotValidBase64OrEncrypted!@#$";

        // Act & Assert
        assertThrows(RuntimeException.class, () -> CryptoUtil.decrypt(invalidEncryptedData));
    }

    @Test
    @DisplayName("Should throw exception when secret key is null")
    void testEncryptWithNullSecretKey() {
        // Arrange
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", null);

        // Act & Assert
        assertThrows(RuntimeException.class, () -> CryptoUtil.encrypt("test"));
    }

    @Test
    @DisplayName("Should handle Base64 encoded values correctly")
    void testBase64Encoding() {
        // Arrange
        String plainText = "BaseEncodingTest";

        // Act
        String encrypted = CryptoUtil.encrypt(plainText);

        // Assert - encrypted should be valid Base64
        try {
            java.util.Base64.getDecoder().decode(encrypted);
            // If we got here, it's valid Base64
            assertTrue(true);
        } catch (IllegalArgumentException e) {
            fail("Encrypted string is not valid Base64: " + e.getMessage());
        }
    }
}
