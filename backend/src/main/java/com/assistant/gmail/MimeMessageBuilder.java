package com.assistant.gmail;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Builds the plain-text RFC 5322 messages this application sends through the Gmail API.
 *
 * Gmail's {@code messages.send} takes the whole message base64url-encoded in a {@code raw}
 * field. The headers and body are declared as UTF-8 and encoded so that accents, CJK text and
 * emoji survive the trip: the body is base64 (RFC 2045) and any non-ASCII subject becomes
 * RFC 2047 encoded words. CR/LF are stripped from header values to block header injection.
 */
public final class MimeMessageBuilder {

    private static final String CRLF = "\r\n";
    /** Max bytes of UTF-8 per encoded word so that "=?UTF-8?B?...?=" stays within 75 chars. */
    private static final int ENCODED_WORD_MAX_BYTES = 45;

    private MimeMessageBuilder() {}

    /** Returns the message in the base64url form expected by Gmail's {@code raw} field. */
    public static String buildRaw(String from, List<String> to, String subject, String body) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(build(from, to, subject, body).getBytes(StandardCharsets.UTF_8));
    }

    /** Returns the full message, headers and body, as text. */
    public static String build(String from, List<String> to, String subject, String body) {
        List<String> recipients = to == null ? List.of() : to.stream()
                .filter(Objects::nonNull)
                .map(MimeMessageBuilder::headerSafe)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        if (recipients.isEmpty()) {
            throw new IllegalArgumentException("At least one recipient is required");
        }

        StringBuilder message = new StringBuilder();
        if (from != null && !headerSafe(from).isEmpty()) {
            message.append("From: ").append(headerSafe(from)).append(CRLF);
        }
        message.append("To: ").append(String.join(", ", recipients)).append(CRLF);
        message.append("Subject: ").append(encodeHeaderValue(subject == null ? "" : headerSafe(subject))).append(CRLF);
        message.append("MIME-Version: 1.0").append(CRLF);
        message.append("Content-Type: text/plain; charset=\"UTF-8\"").append(CRLF);
        message.append("Content-Transfer-Encoding: base64").append(CRLF);
        message.append(CRLF);
        message.append(Base64.getMimeEncoder().encodeToString((body == null ? "" : body).getBytes(StandardCharsets.UTF_8)));
        message.append(CRLF);
        return message.toString();
    }

    /** Removes line breaks (header injection) and surrounding whitespace from a header value. */
    static String headerSafe(String value) {
        return value.replace("\r", "").replace("\n", "").trim();
    }

    /**
     * Returns the value unchanged when it is printable ASCII, otherwise as one or more
     * RFC 2047 "B" encoded words folded onto continuation lines.
     */
    static String encodeHeaderValue(String value) {
        if (value.chars().allMatch(c -> c >= 0x20 && c <= 0x7E)) {
            return value;
        }
        List<String> words = new ArrayList<>();
        StringBuilder chunk = new StringBuilder();
        int chunkBytes = 0;
        for (int i = 0; i < value.length(); ) {
            int codePoint = value.codePointAt(i);
            String ch = new String(Character.toChars(codePoint));
            int bytes = ch.getBytes(StandardCharsets.UTF_8).length;
            if (chunkBytes + bytes > ENCODED_WORD_MAX_BYTES && chunk.length() > 0) {
                words.add(encodedWord(chunk.toString()));
                chunk.setLength(0);
                chunkBytes = 0;
            }
            chunk.append(ch);
            chunkBytes += bytes;
            i += Character.charCount(codePoint);
        }
        if (chunk.length() > 0) {
            words.add(encodedWord(chunk.toString()));
        }
        return String.join(CRLF + " ", words);
    }

    private static String encodedWord(String text) {
        return "=?UTF-8?B?" + Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8)) + "?=";
    }
}
