package com.assistant.whatsapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/whatsapp/webhook")
public class WhatsAppWebhookController {

    @Value("${WHATSAPP_VERIFY_TOKEN:chema_assistant_2026}")
    private String verifyToken;

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
            System.out.println("WhatsApp Webhook Verified!");
            return ResponseEntity.ok(challenge);
        } else {
            return ResponseEntity.status(403).build();
        }
    }

    /**
     * Handle incoming messages (POST)
     */
    @PostMapping
    public ResponseEntity<Void> handleIncomingMessage(@RequestBody String payload) {
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
                                        System.out.println("Saved incoming WhatsApp message from " + profileName);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error parsing WhatsApp webhook: " + e.getMessage());
        }
        return ResponseEntity.ok().build();
    }
}
