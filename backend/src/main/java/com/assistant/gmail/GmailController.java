package com.assistant.gmail;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/gmail")
public class GmailController {

    private final GmailService gmailService;

    @GetMapping("/messages")
    public ResponseEntity<?> getMessages(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int maxResults) {
        return ResponseEntity.ok(gmailService.listMessages(q, maxResults));
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<?> getMessageDetails(@PathVariable String id) {
        return ResponseEntity.ok(gmailService.getMessage(id));
    }

    /**
     * Sends an email. Accepts either a ready-made {@code raw} RFC 5322 message (base64url) or
     * the structured fields {@code from} (optional), {@code to} (string or array), {@code subject}
     * and {@code body}; the message is then assembled server-side with proper UTF-8 handling.
     */
    @PostMapping("/send")
    public ResponseEntity<?> sendEmail(@RequestBody Map<String, Object> payload) {
        Object raw = payload.get("raw");
        if (raw instanceof String rawMessage && !rawMessage.isBlank()) {
            return ResponseEntity.ok(gmailService.sendEmail(Map.of("raw", rawMessage)));
        }

        String built = MimeMessageBuilder.buildRaw(
                asString(payload.get("from")),
                recipients(payload.get("to")),
                asString(payload.get("subject")),
                asString(payload.get("body")));
        return ResponseEntity.ok(gmailService.sendEmail(Map.of("raw", built)));
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    /** {@code to} may be a single string ("a@x.com, b@y.com") or a JSON array of strings. */
    private static List<String> recipients(Object to) {
        if (to == null) {
            return List.of();
        }
        if (to instanceof Collection<?> values) {
            return values.stream().filter(Objects::nonNull).map(Object::toString).toList();
        }
        return Arrays.stream(to.toString().split("[,;]")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    public GmailController(GmailService gmailService) {
        this.gmailService = gmailService;
    }
}
