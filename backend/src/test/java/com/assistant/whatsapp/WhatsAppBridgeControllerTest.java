package com.assistant.whatsapp;

import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WhatsAppBridgeController.class)
@Import(WhatsAppBridgeControllerTest.BridgeHttp.class)
@DisplayName("WhatsAppBridgeController - bridge ingest, proxies and chat API")
class WhatsAppBridgeControllerTest extends WebMvcSecurityTest {

    @TestConfiguration
    static class BridgeHttp {
        @Bean
        StubExchangeFunction bridgeStub() {
            return new StubExchangeFunction();
        }

        @Bean
        WebClient.Builder webClientBuilder(StubExchangeFunction bridgeStub) {
            return bridgeStub.webClientBuilder();
        }
    }

    @Autowired
    private StubExchangeFunction bridge;

    @MockitoBean
    private WhatsAppChatRepository chatRepository;

    @MockitoBean
    private WhatsAppMessageRepository messageRepository;

    @BeforeEach
    void resetBridge() {
        bridge.reset();
        // @MockitoBean mocks are not reset automatically between tests of @Nested classes.
        Mockito.reset(chatRepository, messageRepository);
    }

    private void bridgeIsReady() {
        bridge.otherwiseJson("{\"authenticated\":true,\"ready\":true,\"hasQr\":false}");
    }

    private static WhatsAppChat chat(String id, String name) {
        WhatsAppChat chat = new WhatsAppChat();
        chat.setChatId(id);
        chat.setName(name);
        return chat;
    }

    private WhatsAppChat savedChat() {
        ArgumentCaptor<WhatsAppChat> captor = ArgumentCaptor.forClass(WhatsAppChat.class);
        verify(chatRepository).save(captor.capture());
        return captor.getValue();
    }

    // ── security rules ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("Security")
    class Security {

        @Test
        @DisplayName("Bridge ingest endpoints accept anonymous requests without a CSRF token")
        void ingestIsOpen() throws Exception {
            when(chatRepository.findByChatId(any())).thenReturn(Optional.empty());
            when(messageRepository.findByMessageWaId(any())).thenReturn(Optional.empty());

            mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"1@c.us\"}")).andExpect(status().isOk());
            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messageId\":\"m1\"}")).andExpect(status().isOk());
            mockMvc.perform(post("/api/whatsapp/bridge/chat-preview").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"1@c.us\"}")).andExpect(status().isOk());
            mockMvc.perform(post("/api/whatsapp/bridge/contact-name").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"1@c.us\",\"name\":\"Ana\"}")).andExpect(status().isOk());
            mockMvc.perform(post("/api/whatsapp/bridge/clear-all")).andExpect(status().isOk());
        }

        @Test
        @DisplayName("The frontend chat API requires a session")
        void chatApiRequiresAuth() throws Exception {
            mockMvc.perform(get("/api/whatsapp/chats")).andExpect(status().isUnauthorized());
            mockMvc.perform(get("/api/whatsapp/chats/1@c.us/messages")).andExpect(status().isUnauthorized());
            mockMvc.perform(get("/api/whatsapp/messages/wa/x")).andExpect(status().isUnauthorized());
            mockMvc.perform(post("/api/whatsapp/send").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"to\":\"1\",\"content\":\"x\"}")).andExpect(status().isUnauthorized());
            verifyNoInteractions(chatRepository, messageRepository);
        }

        @Test
        @DisplayName("Sending through the bridge requires a CSRF token")
        void sendRequiresCsrf() throws Exception {
            mockMvc.perform(post("/api/whatsapp/send").with(user()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"to\":\"1\",\"content\":\"x\"}")).andExpect(status().isForbidden());
            assertThat(bridge.requests()).isEmpty();
        }

        @Test
        @Disabled("BUG (security): '/api/whatsapp/bridge/**' is permitAll and CSRF-exempt, which also covers the "
                + "frontend-facing proxies /bridge/reset, /bridge/logout, /bridge/clear-all and /bridge/qr. Any "
                + "anonymous caller can wipe all WhatsApp data, unlink the session or fetch the pairing QR. Only the "
                + "ingest endpoints should be open (ideally behind a shared secret).")
        @DisplayName("Anonymous callers cannot reset/log out the bridge or fetch its pairing QR")
        void destructiveProxiesRequireAuth() throws Exception {
            bridge.otherwiseJson("{\"success\":true}");

            mockMvc.perform(post("/api/whatsapp/bridge/reset")).andExpect(status().isUnauthorized());
            mockMvc.perform(post("/api/whatsapp/bridge/logout")).andExpect(status().isUnauthorized());
            mockMvc.perform(get("/api/whatsapp/bridge/qr")).andExpect(status().isUnauthorized());
            verify(messageRepository, never()).deleteAll();
        }
    }

    // ── ingest: chat ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /bridge/chat")
    class IngestChat {

        @Test
        @DisplayName("Creates a chat from the payload")
        void createsChat() throws Exception {
            when(chatRepository.findByChatId("123@g.us")).thenReturn(Optional.empty());

            mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON).content("""
                    {"chatId":"123@g.us","name":"Family","isGroup":true,"avatarUrl":"https://a/1.png",
                     "lastMessage":"See you","unreadCount":3,"lastMessageTimestamp":"2026-05-01T10:15:30+02:00"}
                    """)).andExpect(status().isOk());

            WhatsAppChat chat = savedChat();
            assertThat(chat.getChatId()).isEqualTo("123@g.us");
            assertThat(chat.getName()).isEqualTo("Family");
            assertThat(chat.isGroup()).isTrue();
            assertThat(chat.getAvatarUrl()).isEqualTo("https://a/1.png");
            assertThat(chat.getLastMessage()).isEqualTo("See you");
            assertThat(chat.getUnreadCount()).isEqualTo(3);
            assertThat(chat.getLastMessageTimestamp()).isEqualTo(LocalDateTime.of(2026, 5, 1, 10, 15, 30));
            assertThat(chat.getUpdatedAt()).isNotNull();
        }

        @Test
        @DisplayName("Updates an existing chat and applies defaults for missing fields")
        void updatesExistingWithDefaults() throws Exception {
            WhatsAppChat existing = chat("1@c.us", "Old");
            existing.setGroup(true);
            when(chatRepository.findByChatId("1@c.us")).thenReturn(Optional.of(existing));

            mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"1@c.us\",\"lastMessageTimestamp\":\"not-a-date\"}"))
                    .andExpect(status().isOk());

            WhatsAppChat chat = savedChat();
            assertThat(chat).isSameAs(existing);
            assertThat(chat.getName()).isEqualTo("Unknown");
            assertThat(chat.isGroup()).isFalse();
            assertThat(chat.getLastMessage()).isEmpty();
            assertThat(chat.getUnreadCount()).isZero();
            assertThat(chat.getLastMessageTimestamp()).isNotNull();
        }

        @Test
        @DisplayName("Rejects a payload without chatId")
        void missingChatId() throws Exception {
            mockMvc.perform(post("/api/whatsapp/bridge/chat").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
            verify(chatRepository, never()).save(any());
        }
    }

    // ── ingest: message ────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /bridge/message")
    class IngestMessage {

        @Test
        @DisplayName("Stores an incoming message with media and resolves the 1:1 chat name from the push name")
        void storesIncomingMessage() throws Exception {
            WhatsAppChat chat = chat("491511234567@s.whatsapp.net", "+49 151 1234567");
            when(messageRepository.findByMessageWaId("WA-1")).thenReturn(Optional.empty());
            when(chatRepository.findByChatId("491511234567@s.whatsapp.net")).thenReturn(Optional.of(chat));

            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON).content("""
                    {"messageId":"WA-1","chatId":"491511234567@s.whatsapp.net","senderId":"491511234567",
                     "chatName":"Ana","body":"","fromMe":false,"isGroup":false,"mediaType":"IMAGE",
                     "mediaData":{"data":"QUJD","mimetype":"image/jpeg"},"quotedMsg":"earlier",
                     "timestamp":"2026-05-01T08:00:00Z","rawPayload":"{}"}
                    """)).andExpect(status().isOk());

            ArgumentCaptor<WhatsAppMessage> msg = ArgumentCaptor.forClass(WhatsAppMessage.class);
            verify(messageRepository).save(msg.capture());
            assertThat(msg.getValue().getMessageWaId()).isEqualTo("WA-1");
            assertThat(msg.getValue().getDirection()).isEqualTo("INCOMING");
            assertThat(msg.getValue().getSenderName()).isEqualTo("Ana");
            assertThat(msg.getValue().getMediaBase64()).isEqualTo("QUJD");
            assertThat(msg.getValue().getMediaMimetype()).isEqualTo("image/jpeg");
            assertThat(msg.getValue().getRepliedToContent()).isEqualTo("earlier");
            assertThat(msg.getValue().getTimestamp()).isEqualTo(LocalDateTime.of(2026, 5, 1, 8, 0));

            assertThat(chat.getName()).isEqualTo("Ana");
            assertThat(chat.getLastMessage()).isEqualTo("📎 image");
            assertThat(chat.getLastMediaType()).isEqualTo("IMAGE");
            assertThat(chat.getLastMessageDirection()).isEqualTo("INCOMING");
            assertThat(chat.getLastMessageTimestamp()).isEqualTo(LocalDateTime.of(2026, 5, 1, 8, 0));
            verify(chatRepository).save(chat);
        }

        @Test
        @DisplayName("Outgoing messages update the preview but never rename the chat")
        void outgoingDoesNotRename() throws Exception {
            WhatsAppChat chat = chat("1@s.whatsapp.net", "123456");
            when(messageRepository.findByMessageWaId("WA-2")).thenReturn(Optional.empty());
            when(chatRepository.findByChatId("1@s.whatsapp.net")).thenReturn(Optional.of(chat));

            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON).content("""
                    {"messageId":"WA-2","chatId":"1@s.whatsapp.net","chatName":"Me Myself","body":"On my way","fromMe":true}
                    """)).andExpect(status().isOk());

            assertThat(chat.getName()).isEqualTo("123456");
            assertThat(chat.getLastMessage()).isEqualTo("On my way");
            assertThat(chat.getLastMessageDirection()).isEqualTo("OUTGOING");
        }

        @Test
        @DisplayName("A real contact name is not replaced by a push name")
        void keepsRealName() throws Exception {
            WhatsAppChat chat = chat("1@s.whatsapp.net", "Mum");
            when(messageRepository.findByMessageWaId("WA-3")).thenReturn(Optional.empty());
            when(chatRepository.findByChatId("1@s.whatsapp.net")).thenReturn(Optional.of(chat));

            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messageId\":\"WA-3\",\"chatId\":\"1@s.whatsapp.net\",\"chatName\":\"Maria\",\"body\":\"hi\"}"))
                    .andExpect(status().isOk());

            assertThat(chat.getName()).isEqualTo("Mum");
        }

        @Test
        @DisplayName("Group messages name a group that is still identified by number")
        void groupName() throws Exception {
            WhatsAppChat group = chat("12036@g.us", "12036");
            when(messageRepository.findByMessageWaId("WA-4")).thenReturn(Optional.empty());
            when(chatRepository.findByChatId("12036@g.us")).thenReturn(Optional.of(group));

            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messageId\":\"WA-4\",\"chatId\":\"12036@g.us\",\"chatName\":\"Climbing crew\",\"isGroup\":true,\"fromMe\":true,\"body\":\"x\"}"))
                    .andExpect(status().isOk());

            assertThat(group.getName()).isEqualTo("Climbing crew");
        }

        @Test
        @DisplayName("Skips duplicates already stored under the same WhatsApp message id")
        void deduplicates() throws Exception {
            when(messageRepository.findByMessageWaId("WA-1")).thenReturn(Optional.of(new WhatsAppMessage()));

            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messageId\":\"WA-1\",\"chatId\":\"1@c.us\"}")).andExpect(status().isOk());

            verify(messageRepository, never()).save(any());
            verifyNoInteractions(chatRepository);
        }

        @Test
        @DisplayName("Rejects a payload without messageId")
        void missingMessageId() throws Exception {
            mockMvc.perform(post("/api/whatsapp/bridge/message").contentType(MediaType.APPLICATION_JSON).content("{\"chatId\":\"1\"}"))
                    .andExpect(status().isBadRequest());
            verify(messageRepository, never()).save(any());
        }
    }

    // ── ingest: preview and contact name ───────────────────────────────────

    @Nested
    @DisplayName("POST /bridge/chat-preview and /bridge/contact-name")
    class PreviewAndNames {

        @Test
        @DisplayName("chat-preview updates an existing chat and clears the media type for text messages")
        void previewUpdatesExisting() throws Exception {
            WhatsAppChat chat = chat("1@c.us", "+34 600 000 000");
            chat.setLastMediaType("IMAGE");
            when(chatRepository.findByChatId("1@c.us")).thenReturn(Optional.of(chat));

            mockMvc.perform(post("/api/whatsapp/bridge/chat-preview").contentType(MediaType.APPLICATION_JSON).content("""
                    {"chatId":"1@c.us","lastMessage":"ok","lastMessageTimestamp":"2026-05-02T09:30:00.000Z",
                     "lastMessageDirection":"OUTGOING","pushName":"Pablo"}
                    """)).andExpect(status().isOk());

            assertThat(chat.getLastMessage()).isEqualTo("ok");
            assertThat(chat.getLastMediaType()).isNull();
            assertThat(chat.getLastMessageTimestamp()).isEqualTo(LocalDateTime.of(2026, 5, 2, 9, 30));
            assertThat(chat.getLastMessageDirection()).isEqualTo("OUTGOING");
            assertThat(chat.getName()).isEqualTo("Pablo");
            verify(chatRepository).save(chat);
        }

        @Test
        @DisplayName("chat-preview creates a missing chat named after the JID's user part")
        void previewCreatesMissing() throws Exception {
            when(chatRepository.findByChatId("4917612345@s.whatsapp.net")).thenReturn(Optional.empty());

            mockMvc.perform(post("/api/whatsapp/bridge/chat-preview").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"4917612345@s.whatsapp.net\",\"lastMessage\":\"hey\",\"mediaType\":\"AUDIO\"}"))
                    .andExpect(status().isOk());

            WhatsAppChat chat = savedChat();
            assertThat(chat.getChatId()).isEqualTo("4917612345@s.whatsapp.net");
            assertThat(chat.getName()).isEqualTo("4917612345");
            assertThat(chat.getLastMessage()).isEqualTo("hey");
            assertThat(chat.getLastMediaType()).isEqualTo("AUDIO");
        }

        @Test
        @DisplayName("chat-preview without chatId answers 400")
        void previewMissingChatId() throws Exception {
            mockMvc.perform(post("/api/whatsapp/bridge/chat-preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("contact-name replaces phone numbers, numeric ids and JIDs but keeps real names")
        void contactNameRules() throws Exception {
            for (String replaceable : List.of("+49 151 123", "12345678901234", "1@c.us", "120363-group")) {
                WhatsAppChat chat = chat("c", replaceable);
                when(chatRepository.findByChatId("c")).thenReturn(Optional.of(chat));

                mockMvc.perform(post("/api/whatsapp/bridge/contact-name").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chatId\":\"c\",\"name\":\"Lucía\"}")).andExpect(status().isOk());

                assertThat(chat.getName()).as("replaces '%s'", replaceable).isEqualTo("Lucía");
            }

            WhatsAppChat named = chat("c", "Lucy");
            when(chatRepository.findByChatId("c")).thenReturn(Optional.of(named));
            mockMvc.perform(post("/api/whatsapp/bridge/contact-name").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"c\",\"name\":\"Lucía\"}")).andExpect(status().isOk());
            assertThat(named.getName()).isEqualTo("Lucy");
        }

        @Test
        @DisplayName("contact-name with a blank name answers 400")
        void contactNameBlank() throws Exception {
            mockMvc.perform(post("/api/whatsapp/bridge/contact-name").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"chatId\":\"c\",\"name\":\"  \"}")).andExpect(status().isBadRequest());
            verifyNoInteractions(chatRepository);
        }

        @Test
        @DisplayName("clear-all wipes messages and chats")
        void clearAll() throws Exception {
            mockMvc.perform(post("/api/whatsapp/bridge/clear-all")).andExpect(status().isOk());

            verify(messageRepository).deleteAll();
            verify(chatRepository).deleteAll();
        }
    }

    // ── proxies ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Bridge proxies")
    class Proxies {

        @Test
        @DisplayName("GET /bridge/status passes the bridge status through")
        void statusPassThrough() throws Exception {
            bridge.enqueueJson("{\"authenticated\":true,\"ready\":true,\"hasQr\":false}");

            mockMvc.perform(get("/api/whatsapp/bridge/status"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.ready").value(true));
            assertThat(bridge.lastRequest().uri().toString()).isEqualTo("http://127.0.0.1:9/status");
        }

        @Test
        @DisplayName("GET /bridge/status reports not-ready when the bridge is down")
        void statusWhenDown() throws Exception {
            bridge.enqueueError(new IllegalStateException("Connection refused"));

            mockMvc.perform(get("/api/whatsapp/bridge/status"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.authenticated").value(false))
                    .andExpect(jsonPath("$.ready").value(false))
                    .andExpect(jsonPath("$.hasQr").value(false));
        }

        @Test
        @DisplayName("GET /bridge/qr returns the PNG from the bridge")
        void qrPng() throws Exception {
            byte[] png = {(byte) 0x89, 'P', 'N', 'G'};
            bridge.enqueue(request -> Mono.just(ClientResponse.create(HttpStatus.OK, ExchangeStrategies.withDefaults())
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.IMAGE_PNG_VALUE)
                    .body(reactor.core.publisher.Flux.just(new org.springframework.core.io.buffer.DefaultDataBufferFactory().wrap(png)))
                    .build()));

            mockMvc.perform(get("/api/whatsapp/bridge/qr").with(user()))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType(MediaType.IMAGE_PNG))
                    .andExpect(content().bytes(png));
            assertThat(bridge.lastRequest().headers().getAccept()).containsExactly(MediaType.IMAGE_PNG);
        }

        @Test
        @DisplayName("GET /bridge/qr answers 204 when there is no QR, mirrors bridge errors, and 503 when unreachable")
        void qrEdgeCases() throws Exception {
            bridge.enqueue(request -> Mono.just(StubExchangeFunction.json(HttpStatus.OK, null)));
            mockMvc.perform(get("/api/whatsapp/bridge/qr").with(user())).andExpect(status().isNoContent());

            bridge.enqueue(HttpStatus.NOT_FOUND, "{}");
            mockMvc.perform(get("/api/whatsapp/bridge/qr").with(user())).andExpect(status().isNotFound());

            bridge.enqueueError(new IllegalStateException("down"));
            mockMvc.perform(get("/api/whatsapp/bridge/qr").with(user())).andExpect(status().isServiceUnavailable());
        }

        @Test
        @DisplayName("POST /send proxies {to, content} to the bridge")
        void sendProxies() throws Exception {
            bridge.enqueueJson("{\"success\":true,\"id\":\"x1\"}");

            mockMvc.perform(post("/api/whatsapp/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"to\":\"491511@s.whatsapp.net\",\"content\":\"Hi\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value("x1"));
            assertThat(bridge.lastRequest().uri().getPath()).isEqualTo("/send");
            assertThat(bridge.lastRequest().body()).contains("\"to\":\"491511@s.whatsapp.net\"").contains("\"content\":\"Hi\"");
        }

        @Test
        @DisplayName("POST /send answers 400 for missing fields and 503 when the bridge fails")
        void sendErrors() throws Exception {
            mockMvc.perform(post("/api/whatsapp/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"to\":\"1\"}")).andExpect(status().isBadRequest());

            bridge.enqueue(HttpStatus.INTERNAL_SERVER_ERROR, "{}");
            mockMvc.perform(post("/api/whatsapp/send").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"to\":\"1\",\"content\":\"x\"}"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.success").value(false));
        }

        @Test
        @DisplayName("POST /bridge/logout proxies the logout and wipes local data")
        void logout() throws Exception {
            bridge.enqueueJson("{\"success\":true}");

            mockMvc.perform(post("/api/whatsapp/bridge/logout").with(user()).with(csrf()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));

            verify(messageRepository).deleteAll();
            verify(chatRepository).deleteAll();
        }

        @Test
        @DisplayName("POST /bridge/logout keeps local data when the bridge is unreachable")
        void logoutBridgeDown() throws Exception {
            bridge.enqueueError(new IllegalStateException("down"));

            mockMvc.perform(post("/api/whatsapp/bridge/logout").with(user()).with(csrf()))
                    .andExpect(status().isServiceUnavailable());

            verify(messageRepository, never()).deleteAll();
        }

        @Test
        @DisplayName("POST /bridge/reset wipes local data first and succeeds even if the bridge exits")
        void reset() throws Exception {
            bridge.enqueueError(new IllegalStateException("bridge exited"));

            mockMvc.perform(post("/api/whatsapp/bridge/reset").with(user()).with(csrf()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Reset triggered (bridge restarting)"));

            verify(messageRepository).deleteAll();
            verify(chatRepository).deleteAll();
        }
    }

    // ── frontend API ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("Chat API")
    class ChatApi {

        @Test
        @DisplayName("GET /chats returns [] without touching the DB when the bridge is not ready")
        void chatsWhenNotReady() throws Exception {
            bridge.otherwiseJson("{\"ready\":false}");

            mockMvc.perform(get("/api/whatsapp/chats").with(user()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
            verifyNoInteractions(chatRepository);
        }

        @Test
        @DisplayName("GET /chats returns stored chats newest first when the bridge is ready")
        void chatsWhenReady() throws Exception {
            bridgeIsReady();
            WhatsAppChat chat = chat("1@c.us", "Ana");
            chat.setGroup(false);
            when(chatRepository.findAllByOrderByLastMessageTimestampDesc()).thenReturn(List.of(chat));

            mockMvc.perform(get("/api/whatsapp/chats").with(user()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].chatId").value("1@c.us"))
                    .andExpect(jsonPath("$[0].name").value("Ana"))
                    .andExpect(jsonPath("$[0].group").value(false));
        }

        @Test
        @DisplayName("GET /chats/{chatId}/messages keeps dots in the JID path variable")
        void messagesForChat() throws Exception {
            bridgeIsReady();
            WhatsAppMessage m = new WhatsAppMessage("491511@s.whatsapp.net", "WA1", "s", "n", "hello", "INCOMING",
                    null, null, null, null, null, null, LocalDateTime.of(2026, 1, 1, 0, 0), null);
            when(messageRepository.findByChatIdOrderByTimestampAsc("491511@s.whatsapp.net")).thenReturn(List.of(m));

            mockMvc.perform(get("/api/whatsapp/chats/491511@s.whatsapp.net/messages").with(user()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].content").value("hello"))
                    .andExpect(jsonPath("$[0].messageWaId").value("WA1"));
        }

        @Test
        @DisplayName("GET /chats/{chatId}/messages returns [] when the bridge is not ready")
        void messagesWhenNotReady() throws Exception {
            bridge.otherwiseJson("{\"ready\":false}");

            mockMvc.perform(get("/api/whatsapp/chats/1@c.us/messages").with(user()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
            verifyNoInteractions(messageRepository);
        }

        @Test
        @DisplayName("GET /messages/wa/{waId} answers 200 or 404")
        void messageByWaId() throws Exception {
            WhatsAppMessage m = new WhatsAppMessage(null, "s", "n", "found", "INCOMING", null);
            when(messageRepository.findByMessageWaId("yes")).thenReturn(Optional.of(m));
            when(messageRepository.findByMessageWaId("no")).thenReturn(Optional.empty());

            mockMvc.perform(get("/api/whatsapp/messages/wa/yes").with(user()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("found"));
            mockMvc.perform(get("/api/whatsapp/messages/wa/no").with(user()))
                    .andExpect(status().isNotFound());
        }
    }
}
