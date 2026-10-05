package com.assistant.whatsapp;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The verify token comes from the test profile: {@code WHATSAPP_VERIFY_TOKEN=test-verify-token}. */
@WebMvcTest(WhatsAppWebhookController.class)
@DisplayName("WhatsAppWebhookController - Meta Cloud API webhook")
class WhatsAppWebhookControllerTest extends WebMvcSecurityTest {

    private static final String TEXT_MESSAGE = """
            {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages","value":{
              "messaging_product":"whatsapp",
              "contacts":[{"wa_id":"999","profile":{"name":"Someone Else"}},{"wa_id":"4915112345678","profile":{"name":"Ana"}}],
              "messages":[
                {"from":"4915112345678","id":"wamid.A","type":"text","text":{"body":"Hola!"}},
                {"from":"4915112345678","id":"wamid.B","type":"image","image":{"id":"media-1"}},
                {"from":"4400000000","id":"wamid.C","type":"text","text":{"body":"Unknown contact"}}
              ]}}]}]}
            """;

    @MockitoBean
    private WhatsAppMessageRepository repository;

    // ── verification handshake ─────────────────────────────────────────────

    @Test
    @DisplayName("GET echoes hub.challenge for a subscribe request with the right token (anonymous)")
    void verifySucceeds() throws Exception {
        mockMvc.perform(get("/api/whatsapp/webhook")
                        .param("hub.mode", "subscribe")
                        .param("hub.verify_token", "test-verify-token")
                        .param("hub.challenge", "1158201444"))
                .andExpect(status().isOk())
                .andExpect(content().string("1158201444"));
    }

    @Test
    @DisplayName("GET answers 403 for a wrong verify token")
    void verifyWrongToken() throws Exception {
        mockMvc.perform(get("/api/whatsapp/webhook")
                        .param("hub.mode", "subscribe")
                        .param("hub.verify_token", "guess")
                        .param("hub.challenge", "1"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET answers 403 for a mode other than subscribe")
    void verifyWrongMode() throws Exception {
        mockMvc.perform(get("/api/whatsapp/webhook")
                        .param("hub.mode", "unsubscribe")
                        .param("hub.verify_token", "test-verify-token")
                        .param("hub.challenge", "1"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET without the hub parameters answers 400 naming the missing one")
    void verifyMissingParams() throws Exception {
        mockMvc.perform(get("/api/whatsapp/webhook").param("hub.verify_token", "x").param("hub.challenge", "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing required parameter 'hub.mode'"));
    }

    // ── notifications ──────────────────────────────────────────────────────

    @Test
    @DisplayName("POST stores text messages (anonymous, no CSRF) with the sender's profile name")
    void storesTextMessages() throws Exception {
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE))
                .andExpect(status().isOk());

        ArgumentCaptor<WhatsAppMessage> captor = ArgumentCaptor.forClass(WhatsAppMessage.class);
        verify(repository, times(2)).save(captor.capture());
        List<WhatsAppMessage> saved = captor.getAllValues();

        assertThat(saved.get(0).getSenderId()).isEqualTo("4915112345678");
        assertThat(saved.get(0).getSenderName()).isEqualTo("Ana");
        assertThat(saved.get(0).getContent()).isEqualTo("Hola!");
        assertThat(saved.get(0).getDirection()).isEqualTo("INCOMING");
        assertThat(saved.get(0).getMessageSid()).isEqualTo("wamid.A");

        // no matching contact entry: the phone number doubles as the display name
        assertThat(saved.get(1).getSenderName()).isEqualTo("4400000000");
        assertThat(saved.get(1).getMessageSid()).isEqualTo("wamid.C");
    }

    @Test
    @DisplayName("POST acknowledges status-only notifications without storing anything")
    void statusNotification() throws Exception {
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content("""
                        {"entry":[{"changes":[{"value":{"statuses":[{"id":"wamid.A","status":"read"}]}}]}]}
                        """))
                .andExpect(status().isOk());

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("POST acknowledges an unparseable payload with 200 so Meta does not retry forever")
    void malformedPayload() throws Exception {
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content("{oops"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entry\":[{\"changes\":[{\"field\":\"x\"}]}]}"))
                .andExpect(status().isOk());

        verify(repository, never()).save(any());
    }

    @Test
    @Disabled("BUG (security): the webhook does not verify Meta's X-Hub-Signature-256 HMAC (app secret), and it "
            + "is permitAll + CSRF-exempt, so anyone can POST forged 'incoming' WhatsApp messages into the database.")
    @DisplayName("POST without a valid X-Hub-Signature-256 is rejected")
    void unsignedPayloadRejected() throws Exception {
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE))
                .andExpect(status().isForbidden());

        verify(repository, never()).save(any());
    }
}
