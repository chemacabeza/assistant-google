package com.assistant.whatsapp;

import com.assistant.testsupport.WebMvcSecurityTest;
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

/**
 * The verify token and app secret come from the test profile:
 * {@code WHATSAPP_VERIFY_TOKEN=test-verify-token}, {@code WHATSAPP_APP_SECRET=test-app-secret}.
 */
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
        mockMvc.perform(signed(TEXT_MESSAGE))
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
        mockMvc.perform(signed("""
                        {"entry":[{"changes":[{"value":{"statuses":[{"id":"wamid.A","status":"read"}]}}]}]}
                        """))
                .andExpect(status().isOk());

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("POST acknowledges an unparseable payload with 200 so Meta does not retry forever")
    void malformedPayload() throws Exception {
        mockMvc.perform(signed("{oops")).andExpect(status().isOk());
        mockMvc.perform(signed("{\"entry\":[{\"changes\":[{\"field\":\"x\"}]}]}")).andExpect(status().isOk());

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("POST without a valid X-Hub-Signature-256 is rejected")
    void unsignedPayloadRejected() throws Exception {
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE))
                .andExpect(status().isForbidden());
        // signed with another secret
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE)
                        .header("X-Hub-Signature-256", signature("wrong-secret", TEXT_MESSAGE)))
                .andExpect(status().isForbidden());
        // signature of a different body (tampered payload)
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE)
                        .header("X-Hub-Signature-256", signature(SECRET, "{}")))
                .andExpect(status().isForbidden());
        // not even hex
        mockMvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(TEXT_MESSAGE)
                        .header("X-Hub-Signature-256", "sha256=zz"))
                .andExpect(status().isForbidden());

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("POST is refused when no app secret is configured, even with a signature")
    void noSecretConfigured(@org.springframework.beans.factory.annotation.Autowired WhatsAppWebhookController controller)
            throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "appSecret", "");
        try {
            mockMvc.perform(signed(TEXT_MESSAGE)).andExpect(status().isForbidden());
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(controller, "appSecret", SECRET);
        }
        verify(repository, never()).save(any());
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private static final String SECRET = "test-app-secret";

    /** Meta's X-Hub-Signature-256 header value for {@code body}. */
    private static String signature(String secret, String body) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + java.util.HexFormat.of().formatHex(mac.doFinal(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    /** An anonymous POST without CSRF, signed like a genuine Meta delivery. */
    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder signed(String body) throws Exception {
        return post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(body)
                .header("X-Hub-Signature-256", signature(SECRET, body));
    }
}
