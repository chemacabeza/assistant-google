package com.assistant.telegram;

import com.assistant.testsupport.StubExchangeFunction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

@DisplayName("TelegramService - sendMessage")
class TelegramServiceTest {

    private StubExchangeFunction http;
    private TelegramService telegramService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        telegramService = new TelegramService(http.webClientBuilder());
    }

    @Test
    @DisplayName("Does nothing when no bot token is configured")
    void noTokenNoCall() {
        ReflectionTestUtils.setField(telegramService, "botToken", "");

        telegramService.sendMessage(1L, "hi");

        assertThat(http.requests()).isEmpty();
    }

    @Test
    @DisplayName("POSTs chat_id and text to the bot's sendMessage endpoint")
    void sendsMessage() {
        ReflectionTestUtils.setField(telegramService, "botToken", "123:ABC");
        http.enqueueJson("{\"ok\":true}");

        telegramService.sendMessage(987654321L, "Hello there");

        assertThat(http.requests()).hasSize(1);
        assertThat(http.lastRequest().method()).isEqualTo(HttpMethod.POST);
        assertThat(http.lastRequest().uri().toString()).isEqualTo("https://api.telegram.org/bot123:ABC/sendMessage");
        assertThat(http.lastRequest().body())
                .contains("\"chat_id\":987654321")
                .contains("\"text\":\"Hello there\"");
    }

    @Test
    @DisplayName("Is fire-and-forget: an upstream error does not propagate to the caller")
    void upstreamErrorDoesNotPropagate() {
        ReflectionTestUtils.setField(telegramService, "botToken", "123:ABC");
        http.enqueue(HttpStatus.BAD_REQUEST, "{\"ok\":false}");

        assertThatCode(() -> telegramService.sendMessage(1L, "x")).doesNotThrowAnyException();
    }
}
