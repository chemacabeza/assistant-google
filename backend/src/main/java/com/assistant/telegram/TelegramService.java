package com.assistant.telegram;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@Service
public class TelegramService {

    @Value("${TELEGRAM_BOT_TOKEN:}")
    private String botToken;

    private final WebClient webClient;

    public TelegramService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public void sendMessage(Long chatId, String text) {
        if (botToken == null || botToken.isEmpty()) {
            return;
        }

        String url = String.format("https://api.telegram.org/bot%s/sendMessage", botToken);
        
        webClient.post()
            .uri(url)
            .bodyValue(Map.of(
                "chat_id", chatId,
                "text", text
            ))
            .retrieve()
            .bodyToMono(String.class)
            .subscribe(
                response -> System.out.println("Telegram sent: " + response),
                error -> System.err.println("Telegram error: " + error.getMessage())
            );
    }
}
