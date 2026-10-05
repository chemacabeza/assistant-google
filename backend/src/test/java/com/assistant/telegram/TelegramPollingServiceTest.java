package com.assistant.telegram;

import com.assistant.assistant.AssistantRoutingService;
import com.assistant.testsupport.StubExchangeFunction;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TelegramPollingService - getUpdates loop")
class TelegramPollingServiceTest {

    @Mock
    private AssistantRoutingService assistantRoutingService;

    @Mock
    private TelegramService telegramService;

    private StubExchangeFunction http;
    private TelegramPollingService pollingService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        pollingService = new TelegramPollingService(http.webClientBuilder(), assistantRoutingService, telegramService, new ObjectMapper());
        ReflectionTestUtils.setField(pollingService, "botToken", "123:ABC");
    }

    @Test
    @DisplayName("Does not poll when no bot token is configured")
    void noToken() {
        ReflectionTestUtils.setField(pollingService, "botToken", "");

        pollingService.pollUpdates();

        assertThat(http.requests()).isEmpty();
        verifyNoInteractions(assistantRoutingService, telegramService);
    }

    @Test
    @DisplayName("Routes each text message to the assistant and replies in the same chat")
    void routesTextMessages() {
        http.enqueueJson("""
                {"ok":true,"result":[
                  {"update_id":100,"message":{"chat":{"id":11},"text":"What's on today?"}},
                  {"update_id":101,"message":{"chat":{"id":22},"text":"Hola"}}
                ]}
                """);
        when(assistantRoutingService.parseIntent("What's on today?", null)).thenReturn(Map.of("action", "CHAT", "response", "Two meetings"));
        when(assistantRoutingService.parseIntent("Hola", null)).thenReturn(Map.of("action", "CHAT", "response", "¡Hola!"));

        pollingService.pollUpdates();

        assertThat(http.lastRequest().uri().toString()).isEqualTo("https://api.telegram.org/bot123:ABC/getUpdates?offset=1");
        var order = inOrder(telegramService);
        order.verify(telegramService).sendMessage(11L, "Two meetings");
        order.verify(telegramService).sendMessage(22L, "¡Hola!");
    }

    @Test
    @DisplayName("Advances the offset past the last seen update_id on the next poll")
    void advancesOffset() {
        http.enqueueJson("{\"ok\":true,\"result\":[{\"update_id\":41,\"edited_message\":{}}]}");
        http.enqueueJson("{\"ok\":true,\"result\":[]}");

        pollingService.pollUpdates();
        pollingService.pollUpdates();

        assertThat(http.requests()).hasSize(2);
        assertThat(http.requests().get(0).queryParam("offset")).isEqualTo("1");
        assertThat(http.requests().get(1).queryParam("offset")).isEqualTo("42");
    }

    @Test
    @DisplayName("Ignores non-text messages (stickers, photos) but still consumes their update")
    void ignoresNonTextMessages() {
        http.enqueueJson("{\"ok\":true,\"result\":[{\"update_id\":5,\"message\":{\"chat\":{\"id\":1},\"sticker\":{}}}]}");
        http.enqueueJson("{\"ok\":true,\"result\":[]}");

        pollingService.pollUpdates();
        pollingService.pollUpdates();

        verifyNoInteractions(assistantRoutingService);
        verify(telegramService, never()).sendMessage(anyLong(), any());
        assertThat(http.lastRequest().queryParam("offset")).isEqualTo("6");
    }

    @Test
    @DisplayName("Swallows upstream errors so the scheduler keeps running")
    void swallowsErrors() {
        http.enqueue(HttpStatus.UNAUTHORIZED, "{\"ok\":false}");

        pollingService.pollUpdates();

        verifyNoInteractions(assistantRoutingService, telegramService);
    }

    @Test
    @DisplayName("A response without a result array is a no-op")
    void noResultArray() {
        http.enqueueJson("{\"ok\":true}");

        pollingService.pollUpdates();

        verify(assistantRoutingService, never()).parseIntent(any(), isNull());
    }
}
