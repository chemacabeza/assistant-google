package com.assistant.whatsapp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Service
public class WhatsAppService {

    @Value("${WHATSAPP_ACCESS_TOKEN:}")
    private String accessToken;

    @Value("${WHATSAPP_PHONE_NUMBER_ID:}")
    private String phoneNumberId;

    private final WebClient webClient;

    public WhatsAppService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public void sendTextMessage(String to, String text) {
        if (accessToken == null || accessToken.isEmpty() || phoneNumberId == null || phoneNumberId.isEmpty()) {
            System.err.println("WhatsApp Cloud API not configured. Missing Access Token or Phone Number ID.");
            return;
        }

        String url = String.format("https://graph.facebook.com/v18.0/%s/messages", phoneNumberId);

        Map<String, Object> body = Map.of(
            "messaging_product", "whatsapp",
            "recipient_type", "individual",
            "to", to,
            "type", "text",
            "text", Map.of("body", text)
        );

        webClient.post()
            .uri(url)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(String.class)
            .subscribe(
                response -> System.out.println("WhatsApp message sent: " + response),
                error -> System.err.println("WhatsApp sending error: " + error.getMessage())
            );
    }
}
