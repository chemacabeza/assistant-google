package com.assistant.whatsapp;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WhatsAppController.class)
@DisplayName("WhatsAppController - /api/whatsapp/messages")
class WhatsAppControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private WhatsAppMessageRepository repository;

    @MockitoBean
    private WhatsAppService whatsAppService;

    @Test
    @DisplayName("GET lists messages newest first")
    void listMessages() throws Exception {
        when(repository.findAllByOrderByTimestampDesc()).thenReturn(List.of(
                new WhatsAppMessage(null, "1", "Ana", "second", "INCOMING", "s2"),
                new WhatsAppMessage(null, "1", "Ana", "first", "INCOMING", "s1")));

        mockMvc.perform(get("/api/whatsapp/messages").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].content").value("second"))
                .andExpect(jsonPath("$[0].senderName").value("Ana"));
    }

    @Test
    @DisplayName("GET requires a session")
    void listRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/whatsapp/messages")).andExpect(status().isUnauthorized());
        verifyNoInteractions(repository);
    }

    @Test
    @DisplayName("POST /send relays the bridge result")
    void send() throws Exception {
        when(whatsAppService.sendTextMessage("+34600000000", "Hola")).thenReturn(Map.of("success", true, "id", "m1"));

        mockMvc.perform(post("/api/whatsapp/messages/send").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"+34600000000\",\"content\":\"Hola\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("m1"));
    }

    @Test
    @DisplayName("POST /send answers 503 when the bridge reports failure")
    void sendBridgeFailure() throws Exception {
        when(whatsAppService.sendTextMessage("1", "x")).thenReturn(Map.of("success", false, "error", "not ready"));

        mockMvc.perform(post("/api/whatsapp/messages/send").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"1\",\"content\":\"x\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("not ready"));
    }

    @Test
    @DisplayName("POST /send answers 400 when 'to' or 'content' is missing")
    void sendMissingFields() throws Exception {
        mockMvc.perform(post("/api/whatsapp/messages/send").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"x\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(whatsAppService);
    }

    @Test
    @DisplayName("POST /send requires CSRF")
    void sendRequiresCsrf() throws Exception {
        mockMvc.perform(post("/api/whatsapp/messages/send").with(user())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"1\",\"content\":\"x\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(whatsAppService);
    }
}
