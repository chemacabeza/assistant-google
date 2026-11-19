package com.assistant.whatsapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@RestController
@RequestMapping("/api/whatsapp/webhook")
public class WhatsAppWebhookController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppWebhookController.class);

    @Value("${WHATSAPP_VERIFY_TOKEN:chema_assistant_2026}")
    private String verifyToken;

    /** Meta app secret; every delivery is signed with it (X-Hub-Signature-256). */
    @Value("${WHATSAPP_APP_SECRET:}")
    private String appSecret;

    private final WhatsAppMessageRepository repository;
    private final ObjectMapper objectMapper;

    public WhatsAppWebhookController(WhatsAppMessageRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /**
     * Webhook verification for Meta (GET)
     */
    @GetMapping
    public ResponseEntity<String> verifyWebhook(
            @RequestParam("hub.mode") String mode,
            @RequestParam("hub.verify_token") String token,
            @RequestParam("hub.challenge") String challenge) {

        if ("subscribe".equals(mode) && verifyToken.equals(token)) {
            log.info("WhatsApp webhook verified");
            return ResponseEntity.ok(challenge);
        } else {
            return ResponseEntity.status(403).build();
        }
    }

    /**
     * Handle incoming messages (POST)
     */
    @PostMapping
    public ResponseEntity<Void> handleIncomingMessage(
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature,
            @RequestBody byte[] body) {
        // The endpoint is public, so only deliveries signed with the app secret are trusted.
        if (!hasValidSignature(body, signature)) {
            log.warn("Rejected WhatsApp webhook delivery: {}", appSecret == null || appSecret.isBlank()
                ? "WHATSAPP_APP_SECRET is not configured" : "missing or invalid X-Hub-Signature-256");
            return ResponseEntity.status(403).build();
        }
        String payload = new String(body, StandardCharsets.UTF_8);
        try {
            JsonNode root = objectMapper.readTree(payload);
            JsonNode entry = root.get("entry");
            if (entry != null && entry.isArray()) {
                for (JsonNode e : entry) {
                    JsonNode changes = e.get("changes");
                    if (changes != null && changes.isArray()) {
                        for (JsonNode change : changes) {
                            JsonNode value = change.get("value");
                            JsonNode messages = value.get("messages");
                            if (messages != null && messages.isArray()) {
                                for (JsonNode msg : messages) {
                                    String from = msg.get("from").asText();
                                    String messageSid = msg.get("id").asText();
                                    
                                    // Extract profile name if available
                                    String profileName = from; // Fallback to number
                                    JsonNode contacts = value.get("contacts");
                                    if (contacts != null && contacts.isArray()) {
                                        for (JsonNode contact : contacts) {
                                            if (contact.has("wa_id") && contact.get("wa_id").asText().equals(from)) {
                                                if (contact.has("profile") && contact.get("profile").has("name")) {
                                                    profileName = contact.get("profile").get("name").asText();
                                                }
                                                break;
                                            }
                                        }
                                    }

                                    if (msg.has("text")) {
                                        String content = msg.get("text").get("body").asText();
                                        
                                        // Save to database
                                        WhatsAppMessage waMsg = new WhatsAppMessage(
                                            null, 
                                            from,
                                            profileName,
                                            content,
                                            "INCOMING",
                                            messageSid
                                        );
                                        repository.save(waMsg);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Meta retries on non-2xx, so acknowledge and log instead of failing the delivery.
            log.warn("Could not parse WhatsApp webhook payload: {}", e.toString());
        }
        return ResponseEntity.ok().build();
    }

    /** Meta signs the raw request body: X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(app secret, body)). */
    private boolean hasValidSignature(byte[] body, String header) {
        if (appSecret == null || appSecret.isBlank() || header == null || !header.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(body);
            byte[] given = HexFormat.of().parseHex(header.substring("sha256=".length()));
            return MessageDigest.isEqual(expected, given); // constant-time comparison
        } catch (IllegalArgumentException e) {
            return false; // not valid hex
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
