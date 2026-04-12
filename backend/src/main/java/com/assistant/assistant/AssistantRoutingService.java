package com.assistant.assistant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AssistantRoutingService {

    @Value("${OPENAI_API_KEY}")
    private String openAiApiKey;

    private final WebClient webClient;

    public AssistantRoutingService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public Map<String, Object> parseIntent(String query) {
        if (openAiApiKey == null || openAiApiKey.isEmpty()) {
            return Map.of("action", "CHAT", "response", "OpenAI API Key is not configured.");
        }

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", "gpt-4o-mini");
        requestBody.put("messages", List.of(
            Map.of("role", "system", "content", "You are a helpful AI assistant. Provide clear and concise answers."),
            Map.of("role", "user", "content", query)
        ));

        try {
            Map response = webClient.post()
                    .uri("https://api.openai.com/v1/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + openAiApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String gptResponse = (String) message.get("content");

            return Map.of(
                "action", "CHAT",
                "response", gptResponse,
                "rawQuery", query
            );
        } catch (Exception e) {
            e.printStackTrace();
            return Map.of(
                "action", "ERROR",
                "response", "Failed to connect to OpenAI: " + e.getMessage(),
                "rawQuery", query
            );
        }
    }
}
