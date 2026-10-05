package com.assistant.integration;

import com.assistant.audit.AuditLogRepository;
import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import com.assistant.templates.CustomAnswerTemplate;
import com.assistant.templates.CustomAnswerTemplateRepository;
import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.whatsapp.WhatsAppChatRepository;
import com.assistant.whatsapp.WhatsAppMessageRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;

import static com.assistant.testsupport.WebMvcSecurityTest.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Boots the whole application (test profile: H2, dummy OAuth client and keys) and drives it through
 * the complete servlet filter chain. Only the Google-facing OAuth2 {@code webClient} bean is swapped
 * for an in-memory stub so no request leaves the JVM.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Application - full context integration")
class ApplicationIntegrationTest {

    private static final StubExchangeFunction GOOGLE = new StubExchangeFunction();

    @TestBean
    private WebClient webClient;

    static WebClient webClient() {
        return GOOGLE.webClient();
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private Environment environment;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private CustomAnswerTemplateRepository templateRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private WhatsAppChatRepository chatRepository;
    @Autowired private WhatsAppMessageRepository messageRepository;

    @BeforeEach
    void seedUsers() {
        GOOGLE.reset();
        userRepository.save(new User(null, "owner@example.com", "Owner", null, null, null));
        userRepository.save(new User(null, "other@example.com", "Other", null, null, null));
    }

    @AfterEach
    void cleanDatabase() {
        auditLogRepository.deleteAll();
        templateRepository.deleteAll();
        messageRepository.deleteAll();
        chatRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("The test profile wins over a developer's ../.env: H2 and dummy credentials are in effect")
    void testProfileIsolatesFromDotEnv() {
        assertThat(environment.getProperty("spring.datasource.url")).startsWith("jdbc:h2:mem:");
        assertThat(environment.getProperty("OPENAI_API_KEY")).isEmpty();
        assertThat(environment.getProperty("TELEGRAM_BOT_TOKEN")).isEmpty();
        assertThat(environment.getProperty("WHATSAPP_VERIFY_TOKEN")).isEqualTo("test-verify-token");
        assertThat(environment.getProperty("spring.security.oauth2.client.registration.google.client-id")).isEqualTo("test-client-id");
    }

    @Test
    @DisplayName("Anonymous API calls get 401; the profile endpoint answers 401 itself")
    void anonymousIsRejected() throws Exception {
        mockMvc.perform(get("/api/templates")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/audit")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/profile")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Signed-in profile is read from the database")
    void profile() throws Exception {
        mockMvc.perform(get("/api/auth/profile").with(user("owner@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("owner@example.com"))
                .andExpect(jsonPath("$.name").value("Owner"));
    }

    @Test
    @DisplayName("Template CRUD persists per user and enforces ownership end-to-end")
    void templateLifecycle() throws Exception {
        String created = mockMvc.perform(post("/api/templates").with(user("owner@example.com")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Weekly update\",\"content\":\"Hi team\",\"category\":\"work\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.user").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(created).get("id").asLong();

        mockMvc.perform(get("/api/templates").with(user("owner@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Weekly update"));
        mockMvc.perform(get("/api/templates").with(user("other@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        mockMvc.perform(put("/api/templates/" + id).with(user("other@example.com")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"hijacked\",\"content\":\"x\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Not allowed to update this template"));
        mockMvc.perform(post("/api/templates").with(user("owner@example.com"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"no csrf\",\"content\":\"x\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/templates/" + id).with(user("owner@example.com")).with(csrf()))
                .andExpect(status().isOk());
        assertThat(templateRepository.findAll()).isEmpty();

        mockMvc.perform(delete("/api/templates/" + id).with(user("owner@example.com")).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Calling an @Auditable Google service records an audit entry visible through /api/audit")
    void auditTrailEndToEnd() throws Exception {
        GOOGLE.enqueueJson("{\"labels\":[{\"id\":\"l1\"}]}");

        mockMvc.perform(get("/api/drive/labels").with(user("owner@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.labels[0].id").value("l1"));
        assertThat(GOOGLE.lastRequest().uri().toString()).isEqualTo("https://drivelabels.googleapis.com/v2/labels");

        mockMvc.perform(get("/api/audit").with(user("owner@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].actionType").value("DRIVE_LIST_LABELS"))
                .andExpect(jsonPath("$[0].details").value("Executed listLabels"));
        mockMvc.perform(get("/api/audit").with(user("other@example.com")))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("Google API failures come back as 502 through the full stack")
    void upstreamFailureIs502() throws Exception {
        GOOGLE.enqueue(org.springframework.http.HttpStatus.UNAUTHORIZED, "{\"error\":\"invalid_token\"}");

        mockMvc.perform(get("/api/gmail/messages/abc").with(user("owner@example.com")))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Upstream service responded with 401"));
    }

    @Test
    @DisplayName("The WhatsApp bridge can ingest chats and messages anonymously without CSRF")
    void bridgeIngest() throws Exception {
        mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chatId\":\"4915112345@s.whatsapp.net\",\"name\":\"+49 151 12345\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messageId\":\"WA-1\",\"chatId\":\"4915112345@s.whatsapp.net\",\"chatName\":\"Ana\",\"body\":\"Hola\"}"))
                .andExpect(status().isOk());
        // the bridge re-sends on reconnect; the duplicate must not create a second row
        mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messageId\":\"WA-1\",\"chatId\":\"4915112345@s.whatsapp.net\",\"body\":\"Hola\"}"))
                .andExpect(status().isOk());

        assertThat(messageRepository.findAll()).hasSize(1);
        var chat = chatRepository.findByChatId("4915112345@s.whatsapp.net").orElseThrow();
        assertThat(chat.getName()).isEqualTo("Ana");
        assertThat(chat.getLastMessage()).isEqualTo("Hola");
        assertThat(chat.getLastMessageDirection()).isEqualTo("INCOMING");

        mockMvc.perform(get("/api/whatsapp/messages/wa/WA-1").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("Hola"));
    }

    @Test
    @DisplayName("The chat list is empty while the bridge is unreachable")
    void chatsWhenBridgeDown() throws Exception {
        mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON).content("{\"chatId\":\"1@c.us\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/whatsapp/chats").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
        mockMvc.perform(get("/api/whatsapp/bridge/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(false));
    }

    @Test
    @DisplayName("The Meta webhook handshake works anonymously with the configured verify token")
    void webhookHandshake() throws Exception {
        mockMvc.perform(get("/api/whatsapp/webhook").param("hub.mode", "subscribe")
                        .param("hub.verify_token", "test-verify-token").param("hub.challenge", "42"))
                .andExpect(status().isOk())
                .andExpect(content().string("42"));
        mockMvc.perform(get("/api/whatsapp/webhook").param("hub.mode", "subscribe")
                        .param("hub.verify_token", "chema_assistant_2026").param("hub.challenge", "42"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("The assistant answers without an OpenAI key instead of failing")
    void assistantWithoutKey() throws Exception {
        String body = mockMvc.perform(post("/api/assistant/ask").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"hello\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode json = objectMapper.readTree(body);
        assertThat(json.get("action").asText()).isEqualTo("CHAT");
        assertThat(json.get("response").asText()).isEqualTo("OpenAI API Key is not configured.");
    }

    @Test
    @DisplayName("Templates created through the API are picked up by the scheduled-email query")
    void scheduledTemplatesAreQueryable() throws Exception {
        // far-future sendAt so the real @Scheduled dispatcher running in this context never picks it up
        mockMvc.perform(post("/api/templates").with(user("owner@example.com")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Due\",\"content\":\"x\",\"targetEmail\":\"f@example.com\",\"sendAt\":\"2999-01-01T08:00:00\"}"))
                .andExpect(status().isOk());

        List<CustomAnswerTemplate> due = templateRepository.findPendingScheduledEmails("PENDING", java.time.LocalDateTime.of(2999, 1, 1, 9, 0));
        assertThat(due).extracting(CustomAnswerTemplate::getTitle).containsExactly("Due");
    }
}
