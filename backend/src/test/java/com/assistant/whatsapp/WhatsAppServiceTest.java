package com.assistant.whatsapp;

import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.testsupport.StubExchangeFunction.RecordedRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Mono;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("WhatsAppService - sending through the WhatsApp bridge")
class WhatsAppServiceTest {

    private StubExchangeFunction http;
    private WhatsAppService whatsAppService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        whatsAppService = new WhatsAppService(http.webClientBuilder());
        ReflectionTestUtils.setField(whatsAppService, "bridgeUrl", "http://bridge.test:3001");
    }

    @Test
    @DisplayName("POSTs {to, content} as JSON to the bridge /send endpoint and returns its answer")
    void sendsToBridge() {
        http.enqueueJson("{\"success\":true,\"id\":\"wamid.1\"}");

        Map<String, Object> result = whatsAppService.sendTextMessage("+4915112345678", "Hola");

        RecordedRequest request = http.lastRequest();
        assertThat(request.method()).isEqualTo(HttpMethod.POST);
        assertThat(request.uri().toString()).isEqualTo("http://bridge.test:3001/send");
        assertThat(request.headers().getContentType().toString()).isEqualTo("application/json");
        assertThat(request.body()).contains("\"to\":\"+4915112345678\"").contains("\"content\":\"Hola\"");
        assertThat(result).containsEntry("success", true).containsEntry("id", "wamid.1");
    }

    @Test
    @DisplayName("An empty bridge response is reported as success")
    void emptyResponseIsSuccess() {
        http.enqueue(request -> Mono.just(StubExchangeFunction.json(HttpStatus.OK, null)));

        assertThat(whatsAppService.sendTextMessage("1@s.whatsapp.net", "x")).containsExactly(Map.entry("success", true));
    }

    @Test
    @DisplayName("Bridge errors are reported as success=false with the error message")
    void bridgeErrorIsReported() {
        http.enqueue(HttpStatus.SERVICE_UNAVAILABLE, "{\"error\":\"not ready\"}");

        Map<String, Object> result = whatsAppService.sendTextMessage("1@s.whatsapp.net", "x");

        assertThat(result).containsEntry("success", false);
        assertThat((String) result.get("error")).contains("503");
    }

    @Test
    @DisplayName("Connection failures are reported as success=false")
    void connectionFailureIsReported() {
        http.enqueueError(new IllegalStateException("Connection refused"));

        Map<String, Object> result = whatsAppService.sendTextMessage("1@s.whatsapp.net", "x");

        assertThat(result).containsEntry("success", false).containsEntry("error", "Connection refused");
        assertThat(http.lastRequest().headers().getFirst(HttpHeaders.CONTENT_TYPE)).isEqualTo("application/json");
    }
}
