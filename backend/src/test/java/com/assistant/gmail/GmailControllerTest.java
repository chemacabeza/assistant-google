package com.assistant.gmail;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(GmailController.class)
@DisplayName("GmailController - /api/gmail")
class GmailControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private GmailService gmailService;

    private String sentMime() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(gmailService).sendEmail(captor.capture());
        return new String(Base64.getUrlDecoder().decode(captor.getValue().get("raw")), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("GET /messages defaults maxResults to 20 and forwards q")
    void listMessages() throws Exception {
        when(gmailService.listMessages(null, 20)).thenReturn(Map.of("messages", java.util.List.of()));
        when(gmailService.listMessages("is:unread", 5)).thenReturn(Map.of("resultSizeEstimate", 0));

        mockMvc.perform(get("/api/gmail/messages").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.messages").isArray());
        mockMvc.perform(get("/api/gmail/messages").param("q", "is:unread").param("maxResults", "5").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.resultSizeEstimate").value(0));
    }

    @Test
    @DisplayName("GET /messages/{id} returns message details")
    void getMessage() throws Exception {
        when(gmailService.getMessage("m1")).thenReturn(Map.of("id", "m1", "snippet", "Hi"));

        mockMvc.perform(get("/api/gmail/messages/m1").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.snippet").value("Hi"));
    }

    @Test
    @DisplayName("POST /send passes a ready-made raw message through untouched")
    void sendRaw() throws Exception {
        when(gmailService.sendEmail(Map.of("raw", "UkFX"))).thenReturn(Map.of("id", "sent"));

        mockMvc.perform(post("/api/gmail/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"raw\":\"UkFX\",\"to\":\"ignored@example.com\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value("sent"));
    }

    @Test
    @DisplayName("POST /send builds the message from structured fields, splitting a comma/semicolon 'to' string")
    void sendStructuredString() throws Exception {
        when(gmailService.sendEmail(any())).thenReturn(Map.of("id", "sent"));

        mockMvc.perform(post("/api/gmail/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"from\":\"me@example.com\",\"to\":\"a@example.com; b@example.com,\",\"subject\":\"Hi\",\"body\":\"Text\",\"raw\":\"  \"}"))
                .andExpect(status().isOk());

        assertThat(sentMime()).contains("From: me@example.com").contains("To: a@example.com, b@example.com").contains("Subject: Hi");
    }

    @Test
    @DisplayName("POST /send accepts 'to' as a JSON array")
    void sendStructuredArray() throws Exception {
        when(gmailService.sendEmail(any())).thenReturn(Map.of());

        mockMvc.perform(post("/api/gmail/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"to\":[\"a@example.com\",null,\"c@example.com\"],\"subject\":\"S\",\"body\":\"B\"}"))
                .andExpect(status().isOk());

        assertThat(sentMime()).contains("To: a@example.com, c@example.com").doesNotContain("From:");
    }

    @Test
    @DisplayName("POST /send requires a session and CSRF")
    void sendSecurity() throws Exception {
        mockMvc.perform(post("/api/gmail/send").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"raw\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/gmail/send").with(user()).contentType(MediaType.APPLICATION_JSON).content("{\"raw\":\"x\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(gmailService);
    }

    @Test
    @DisplayName("GET with the wrong method answers 405")
    void wrongMethod() throws Exception {
        mockMvc.perform(get("/api/gmail/send").with(user()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.message").value("Method not allowed"));
    }
}
