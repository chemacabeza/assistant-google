package com.assistant.gmail;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MimeMessageBuilder - RFC 5322 message construction")
class MimeMessageBuilderTest {

    private static final Pattern ENCODED_WORD = Pattern.compile("=\\?UTF-8\\?B\\?([A-Za-z0-9+/=]+)\\?=");

    /** Splits a message into (headers, body) at the first blank line. */
    private static String[] split(String message) {
        int idx = message.indexOf("\r\n\r\n");
        assertTrue(idx > 0, "message must contain a blank line between headers and body");
        return new String[] { message.substring(0, idx), message.substring(idx + 4) };
    }

    private static String header(String headers, String name) {
        // Unfold continuation lines first (CRLF followed by whitespace).
        String unfolded = headers.replaceAll("\r\n[ \t]", " ");
        return Arrays.stream(unfolded.split("\r\n"))
                .filter(l -> l.toLowerCase().startsWith(name.toLowerCase() + ":"))
                .map(l -> l.substring(name.length() + 1).trim())
                .findFirst()
                .orElse(null);
    }

    private static String decodeBody(String body) {
        return new String(Base64.getMimeDecoder().decode(body), StandardCharsets.UTF_8);
    }

    private static String decodeSubject(String subject) {
        Matcher m = ENCODED_WORD.matcher(subject);
        if (!m.find()) return subject;
        StringBuilder out = new StringBuilder();
        m.reset();
        while (m.find()) {
            out.append(new String(Base64.getDecoder().decode(m.group(1)), StandardCharsets.UTF_8));
        }
        return out.toString();
    }

    @Test
    @DisplayName("Builds a plain ASCII message with the expected headers and a decodable body")
    void asciiMessage() {
        String message = MimeMessageBuilder.build("me@example.com", List.of("you@example.com"), "Hello", "Plain body");
        String[] parts = split(message);

        assertEquals("me@example.com", header(parts[0], "From"));
        assertEquals("you@example.com", header(parts[0], "To"));
        assertEquals("Hello", header(parts[0], "Subject"));
        assertEquals("1.0", header(parts[0], "MIME-Version"));
        assertEquals("text/plain; charset=\"UTF-8\"", header(parts[0], "Content-Type"));
        assertEquals("base64", header(parts[0], "Content-Transfer-Encoding"));
        assertEquals("Plain body", decodeBody(parts[1]));
    }

    @Test
    @DisplayName("Headers are separated by CRLF as RFC 5322 requires")
    void usesCrlf() {
        String message = MimeMessageBuilder.build(null, List.of("a@b.c"), "s", "b");

        assertTrue(message.startsWith("To: a@b.c\r\nSubject: s\r\n"));
        assertFalse(message.replace("\r\n", "").contains("\n"), "no bare LF");
    }

    @Test
    @DisplayName("From header is omitted when not provided")
    void omitsFromWhenBlank() {
        assertNull(header(split(MimeMessageBuilder.build(null, List.of("a@b.c"), "s", "b"))[0], "From"));
        assertNull(header(split(MimeMessageBuilder.build("   ", List.of("a@b.c"), "s", "b"))[0], "From"));
    }

    @Test
    @DisplayName("Multiple recipients are joined with a comma")
    void multipleRecipients() {
        String headers = split(MimeMessageBuilder.build(null, List.of("a@b.c", " d@e.f "), "s", "b"))[0];

        assertEquals("a@b.c, d@e.f", header(headers, "To"));
    }

    @Test
    @DisplayName("At least one recipient is required")
    void requiresRecipient() {
        assertThrows(IllegalArgumentException.class, () -> MimeMessageBuilder.build(null, null, "s", "b"));
        assertThrows(IllegalArgumentException.class, () -> MimeMessageBuilder.build(null, List.of(), "s", "b"));
        assertThrows(IllegalArgumentException.class, () -> MimeMessageBuilder.build(null, List.of("  "), "s", "b"));
    }

    @Test
    @DisplayName("Non-ASCII body text survives the round trip")
    void unicodeBody() {
        String body = "Hola Mamá, ¿cómo estás?\nGrüße aus Berlin 🚀 — 你好";
        String message = MimeMessageBuilder.build(null, List.of("a@b.c"), "s", body);

        assertEquals(body, decodeBody(split(message)[1]));
    }

    @Test
    @DisplayName("Body lines are wrapped at 76 characters")
    void bodyIsLineWrapped() {
        String body = "x".repeat(2000);
        String encoded = split(MimeMessageBuilder.build(null, List.of("a@b.c"), "s", body))[1];

        for (String line : encoded.split("\r\n")) {
            assertTrue(line.length() <= 76, "line too long: " + line.length());
        }
        assertEquals(body, decodeBody(encoded));
    }

    @Test
    @DisplayName("Non-ASCII subject becomes an RFC 2047 encoded word")
    void unicodeSubject() {
        String subject = "Reunión mañana ☕";
        String headers = split(MimeMessageBuilder.build(null, List.of("a@b.c"), subject, "b"))[0];
        String encoded = header(headers, "Subject");

        assertTrue(encoded.startsWith("=?UTF-8?B?"), encoded);
        assertTrue(encoded.chars().allMatch(c -> c < 0x80), "header must be ASCII only");
        assertEquals(subject, decodeSubject(encoded));
    }

    @Test
    @DisplayName("Long non-ASCII subjects are split into encoded words of at most 75 characters without breaking characters")
    void longUnicodeSubjectIsFolded() {
        String subject = "日本語の件名はとても長くなることがあります。".repeat(4) + " émoji 🚀🚀🚀 fin";
        String message = MimeMessageBuilder.build(null, List.of("a@b.c"), subject, "b");
        String rawSubjectBlock = message.substring(message.indexOf("Subject: ") + 9, message.indexOf("\r\nMIME-Version"));

        List<String> words = Arrays.stream(rawSubjectBlock.split("\r\n ")).collect(Collectors.toList());
        assertTrue(words.size() > 1, "expected several encoded words");
        for (String word : words) {
            assertTrue(word.length() <= 75, "encoded word too long: " + word.length());
            assertTrue(ENCODED_WORD.matcher(word).matches(), word);
        }
        assertEquals(subject, decodeSubject(header(split(message)[0], "Subject")));
    }

    @Test
    @DisplayName("Line breaks in header values are stripped to prevent header injection")
    void stripsHeaderInjection() {
        String headers = split(MimeMessageBuilder.build(
                "me@example.com\r\nBcc: evil@example.com",
                List.of("you@example.com\nCc: other@example.com"),
                "Hi\r\nX-Injected: yes", "b"))[0];

        assertNull(header(headers, "Bcc"));
        assertNull(header(headers, "Cc"));
        assertNull(header(headers, "X-Injected"));
        assertEquals("me@example.comBcc: evil@example.com", header(headers, "From"));
        assertEquals("HiX-Injected: yes", header(headers, "Subject"));
    }

    @Test
    @DisplayName("Null subject and body are treated as empty")
    void nullSubjectAndBody() {
        String message = MimeMessageBuilder.build(null, List.of("a@b.c"), null, null);
        String[] parts = split(message);

        assertEquals("", header(parts[0], "Subject"));
        assertEquals("", decodeBody(parts[1]));
    }

    @Test
    @DisplayName("buildRaw returns the message as unpadded base64url")
    void buildRawIsBase64Url() {
        String raw = MimeMessageBuilder.buildRaw("me@x.y", List.of("a@b.c"), "Sübject", "bödy");

        assertFalse(raw.contains("+"));
        assertFalse(raw.contains("/"));
        assertFalse(raw.endsWith("="));
        String decoded = new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);
        assertEquals(MimeMessageBuilder.build("me@x.y", List.of("a@b.c"), "Sübject", "bödy").length(), decoded.length());
        assertEquals("bödy", decodeBody(split(decoded)[1]));
    }
}
