package com.assistant.telegram;

import com.assistant.assistant.AssistantRoutingService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
public class TelegramPollingService {

    @Value("${TELEGRAM_BOT_TOKEN:}")
    private String botToken;

    private final WebClient webClient;
    private final AssistantRoutingService assistantRoutingService;
    private final TelegramService telegramService;
    private final ObjectMapper objectMapper;
    private int lastUpdateId = 0;

    public TelegramPollingService(WebClient.Builder webClientBuilder, 
                                  AssistantRoutingService assistantRoutingService, 
                                  TelegramService telegramService, 
                                  ObjectMapper objectMapper) {
        this.webClient = webClientBuilder.build();
        this.assistantRoutingService = assistantRoutingService;
        this.telegramService = telegramService;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelay = 2000)
    public void pollUpdates() {
        if (botToken == null || botToken.isEmpty()) {
            return;
        }

        String url = String.format("https://api.telegram.org/bot%s/getUpdates?offset=%d", botToken, lastUpdateId + 1);

        try {
            String response = webClient.get()
                .uri(url)
                .retrieve()
                .bodyToMono(String.class)
                .block();

            JsonNode root = objectMapper.readTree(response);
            JsonNode result = root.get("result");

            if (result != null && result.isArray()) {
                for (JsonNode update : result) {
                    lastUpdateId = update.get("update_id").asInt();
                    
                    if (update.has("message")) {
                        JsonNode message = update.get("message");
                        long chatId = message.get("chat").get("id").asLong();
                        
                        if (message.has("text")) {
                            String text = message.get("text").asText();
                            System.out.println("Received Telegram message: " + text);

                            // Send "Processing..." or just handle it
                            // Route to Assistant
                            Map<String, Object> assistantResult = assistantRoutingService.parseIntent(text, null);
                            String assistantResponse = (String) assistantResult.get("response");

                            // Send back to Telegram
                            telegramService.sendMessage(chatId, assistantResponse);
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Telegram Polling Error: " + e.getMessage());
        }
    }
}
