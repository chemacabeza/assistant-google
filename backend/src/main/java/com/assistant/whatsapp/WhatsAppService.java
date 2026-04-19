package com.assistant.whatsapp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Service
public class WhatsAppService {

    @Value("${BRIDGE_URL:http://whatsapp-bridge:3001}")
    private String bridgeUrl;

    private final WebClient webClient;

    public WhatsAppService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    /**
     * Sends a text message via the native whatsapp-bridge.
     * @param to The recipient's JID (e.g., "1234567890@s.whatsapp.net") or group JID.
     * @param text The message content.
     * @return The bridge response map.
     */
    public Map<String, Object> sendTextMessage(String to, String text) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = webClient.post()
                .uri(bridgeUrl + "/send")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("to", to, "content", text))
                .retrieve()
                .bodyToMono(Map.class)
                .block(java.time.Duration.ofSeconds(10));

            return result != null ? result : Map.of("success", true);
        } catch (Exception e) {
            System.err.println("WhatsApp Bridge error: " + e.getMessage());
            return Map.of("success", false, "error", e.getMessage());
        }
    }
}
