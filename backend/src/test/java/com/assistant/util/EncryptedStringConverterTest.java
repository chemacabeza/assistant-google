package com.assistant.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("EncryptedStringConverter - JPA Attribute Conversion Tests")
class EncryptedStringConverterTest {

    private EncryptedStringConverter converter;
    private static final String TEST_SECRET_KEY = "1234567890123456"; // 16 bytes for AES

    @BeforeEach
    void setUp() {
        converter = new EncryptedStringConverter();
        // Set the secret key via reflection since it's injected in CryptoUtil
        ReflectionTestUtils.setField(CryptoUtil.class, "secretKey", TEST_SECRET_KEY);
    }

    @Test
    @DisplayName("Should convert attribute to encrypted database column value")
    void testConvertToDatabaseColumn() {
        // Arrange
        String plainText = "SensitiveData";

        // Act
        String encrypted = converter.convertToDatabaseColumn(plainText);

        // Assert
        assertNotNull(encrypted);
        assertNotEquals(plainText, encrypted);
        assertTrue(encrypted.length() > 0);
    }

    @Test
    @DisplayName("Should convert encrypted database column back to entity attribute")
    void testConvertToEntityAttribute() {
        // Arrange
        String plainText = "SecretPassword123";
        String encrypted = converter.convertToDatabaseColumn(plainText);

        // Act
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals(plainText, decrypted);
    }

    @Test
    @DisplayName("Should handle null value in convertToDatabaseColumn")
    void testConvertToDatabaseColumnWithNull() {
        // Arrange & Act
        String result = converter.convertToDatabaseColumn(null);

        // Assert
        assertNull(result);
    }

    @Test
    @DisplayName("Should handle null value in convertToEntityAttribute")
    void testConvertToEntityAttributeWithNull() {
        // Arrange & Act
        String result = converter.convertToEntityAttribute(null);

        // Assert
        assertNull(result);
    }

    @ParameterizedTest
    @DisplayName("Should handle various string values in round-trip conversion")
    @ValueSource(strings = {
        "SimpleString",
        "StringWithNumbers123",
        "StringWithSpecialChars!@#$%^&*()",
        "VeryLongStringWithManyCharactersToTestEncryption1234567890",
        ""
    })
    void testRoundTripConversion(String input) {
        // Act
        String encrypted = converter.convertToDatabaseColumn(input);
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals(input, decrypted);
    }

    @Test
    @DisplayName("Should encrypt the same value to different ciphertexts that both decrypt")
    void testEncryptionUsesRandomIv() {
        // Arrange
        String plainText = "TestData";

        // Act
        String encrypted1 = converter.convertToDatabaseColumn(plainText);
        String encrypted2 = converter.convertToDatabaseColumn(plainText);

        // Assert
        assertNotEquals(encrypted1, encrypted2);
        assertEquals(plainText, converter.convertToEntityAttribute(encrypted1));
        assertEquals(plainText, converter.convertToEntityAttribute(encrypted2));
    }

    @Test
    @DisplayName("Should produce different encrypted values for different inputs")
    void testDifferentInputsProduceDifferentCiphertext() {
        // Act
        String encrypted1 = converter.convertToDatabaseColumn("Input1");
        String encrypted2 = converter.convertToDatabaseColumn("Input2");

        // Assert
        assertNotEquals(encrypted1, encrypted2);
    }

    @Test
    @DisplayName("Should handle empty string conversion")
    void testEmptyStringConversion() {
        // Act
        String encrypted = converter.convertToDatabaseColumn("");
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals("", decrypted);
    }

    @Test
    @DisplayName("Should handle single character conversion")
    void testSingleCharacterConversion() {
        // Act
        String encrypted = converter.convertToDatabaseColumn("X");
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals("X", decrypted);
    }

    @Test
    @DisplayName("Should convert numeric string")
    void testNumericStringConversion() {
        // Arrange
        String numberString = "123456789";

        // Act
        String encrypted = converter.convertToDatabaseColumn(numberString);
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals(numberString, decrypted);
    }

    @Test
    @DisplayName("Should convert JSON string")
    void testJsonStringConversion() {
        // Arrange
        String jsonString = "{\"key\":\"value\",\"number\":123}";

        // Act
        String encrypted = converter.convertToDatabaseColumn(jsonString);
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals(jsonString, decrypted);
    }

    @Test
    @DisplayName("Should convert Unicode string")
    void testUnicodeStringConversion() {
        // Arrange
        String unicodeString = "Hello世界مرحبا🌍";

        // Act
        String encrypted = converter.convertToDatabaseColumn(unicodeString);
        String decrypted = converter.convertToEntityAttribute(encrypted);

        // Assert
        assertEquals(unicodeString, decrypted);
    }
}
