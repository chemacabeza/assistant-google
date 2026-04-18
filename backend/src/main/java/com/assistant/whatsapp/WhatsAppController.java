package com.assistant.whatsapp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/whatsapp/messages")
public class WhatsAppController {

    private final WhatsAppMessageRepository repository;
    private final WebClient webClient;

    @Value("${BRIDGE_URL:http://whatsapp-bridge:3001}")
    private String bridgeUrl;

    public WhatsAppController(WhatsAppMessageRepository repository, WebClient.Builder webClientBuilder) {
        this.repository = repository;
        this.webClient  = webClientBuilder.build();
    }

    @GetMapping
    public List<WhatsAppMessage> getAllMessages() {
        return repository.findAllByOrderByTimestampDesc();
    }

    /**
     * Send a WhatsApp message via the whatsapp-bridge service.
     * Replaces the old Meta Cloud API path (which required a separate token).
     */
    @PostMapping("/send")
    public ResponseEntity<Object> sendMessage(@RequestBody Map<String, String> request) {
        String to      = request.get("to");
        String content = request.get("content");

        if (to == null || content == null) {
            return ResponseEntity.badRequest().build();
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = webClient.post()
                .uri(bridgeUrl + "/send")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("to", to, "content", content))
                .retrieve()
                .bodyToMono(Map.class)
                .block(java.time.Duration.ofSeconds(10));

            return ResponseEntity.ok(result != null ? result : Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "Bridge unavailable: " + e.getMessage()));
        }
    }
}
