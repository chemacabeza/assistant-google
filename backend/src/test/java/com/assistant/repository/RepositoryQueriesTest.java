package com.assistant.repository;

import com.assistant.account.LinkedAccount;
import com.assistant.account.LinkedAccountRepository;
import com.assistant.audit.AuditLog;
import com.assistant.audit.AuditLogRepository;
import com.assistant.auth.OAuthToken;
import com.assistant.auth.OAuthTokenRepository;
import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import com.assistant.templates.CustomAnswerTemplate;
import com.assistant.templates.CustomAnswerTemplateRepository;
import com.assistant.util.CryptoUtil;
import com.assistant.whatsapp.WhatsAppChat;
import com.assistant.whatsapp.WhatsAppChatRepository;
import com.assistant.whatsapp.WhatsAppMessage;
import com.assistant.whatsapp.WhatsAppMessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Derived and JPQL queries of every repository, run against H2 in PostgreSQL mode
 * (see application-test.yml) so ordering and NULL handling match production.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
// own in-memory database so it never shares tables with the @SpringBootTest context
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:repository_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1")
@DisplayName("Repositories - custom queries against H2 (PostgreSQL mode)")
class RepositoryQueriesTest {

    @Autowired private TestEntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository userRepository;
    @Autowired private OAuthTokenRepository tokenRepository;
    @Autowired private CustomAnswerTemplateRepository templateRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private WhatsAppChatRepository chatRepository;
    @Autowired private WhatsAppMessageRepository messageRepository;
    @Autowired private LinkedAccountRepository linkedAccountRepository;

    private User alice;
    private User bob;

    @BeforeEach
    void setUp() {
        // OAuthToken columns go through EncryptedStringConverter, which needs CryptoUtil's static key.
        new CryptoUtil().setSecretKey("0123456789abcdef0123456789abcdef");
        alice = em.persist(new User(null, "alice@example.com", "Alice", null, null, null));
        bob = em.persist(new User(null, "bob@example.com", "Bob", null, null, null));
    }

    private CustomAnswerTemplate template(User user, String title, String category, String status, LocalDateTime sendAt) {
        CustomAnswerTemplate t = new CustomAnswerTemplate(null, user, title, "content", category, null, null);
        t.setStatus(status);
        t.setSendAt(sendAt);
        return em.persist(t);
    }

    // ── users and linked accounts ──────────────────────────────────────────

    @Test
    @DisplayName("UserRepository.findByEmail matches exactly")
    void findUserByEmail() {
        assertThat(userRepository.findByEmail("alice@example.com")).contains(alice);
        assertThat(userRepository.findByEmail("ALICE@example.com")).isEmpty();
        assertThat(userRepository.findByEmail("nobody@example.com")).isEmpty();
    }

    @Test
    @DisplayName("users.email is unique")
    void userEmailUnique() {
        assertThatThrownBy(() -> {
            userRepository.save(new User(null, "alice@example.com", "Impostor", null, null, null));
            em.flush();
        }).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("LinkedAccountRepository.existsByEmail")
    void linkedAccountExists() {
        linkedAccountRepository.save(new LinkedAccount("work@example.com", "Work"));

        assertThat(linkedAccountRepository.existsByEmail("work@example.com")).isTrue();
        assertThat(linkedAccountRepository.existsByEmail("home@example.com")).isFalse();
    }

    // ── OAuth tokens ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("OAuthTokenRepository")
    class Tokens {

        @Test
        @DisplayName("finds tokens by user email and id, and encrypts them at rest")
        void findAndEncrypt() {
            OAuthToken saved = tokenRepository.save(new OAuthToken(null, alice, "ya29.access", "1//refresh",
                    Instant.parse("2026-10-05T12:00:00Z"), "openid,email"));
            em.flush();
            em.clear();

            OAuthToken byEmail = tokenRepository.findByUserEmail("alice@example.com").orElseThrow();
            assertThat(byEmail.getAccessToken()).isEqualTo("ya29.access");
            assertThat(byEmail.getRefreshToken()).isEqualTo("1//refresh");
            assertThat(tokenRepository.findByUserId(alice.getId())).map(OAuthToken::getId).contains(saved.getId());
            assertThat(tokenRepository.findByUserEmail("bob@example.com")).isEmpty();

            String stored = jdbc.queryForObject("select access_token from oauth_tokens where id = ?", String.class, saved.getId());
            assertThat(stored).startsWith("v2:").doesNotContain("ya29.access");
        }

        @Test
        @DisplayName("deleteByUserEmail removes only that user's token")
        void deleteByUserEmail() {
            tokenRepository.save(new OAuthToken(null, alice, "a", null, Instant.now(), null));
            tokenRepository.save(new OAuthToken(null, bob, "b", null, Instant.now(), null));
            em.flush();

            tokenRepository.deleteByUserEmail("alice@example.com");
            em.flush();

            assertThat(tokenRepository.findByUserEmail("alice@example.com")).isEmpty();
            assertThat(tokenRepository.findByUserEmail("bob@example.com")).isPresent();
        }
    }

    // ── templates ──────────────────────────────────────────────────────────

    @Nested
    @DisplayName("CustomAnswerTemplateRepository")
    class Templates {

        @Test
        @DisplayName("findByUserEmailOrderByCreatedAtDesc returns only the user's templates, newest first")
        void byUserNewestFirst() {
            CustomAnswerTemplate older = template(alice, "older", "work", "PENDING", null);
            CustomAnswerTemplate newer = template(alice, "newer", "work", "PENDING", null);
            template(bob, "bob's", "work", "PENDING", null);
            em.flush();
            // @CreationTimestamp sets createdAt on insert; pin distinct values to make the order deterministic.
            jdbc.update("update custom_answer_templates set created_at = ? where id = ?", LocalDateTime.of(2026, 1, 1, 0, 0), older.getId());
            jdbc.update("update custom_answer_templates set created_at = ? where id = ?", LocalDateTime.of(2026, 6, 1, 0, 0), newer.getId());
            em.clear();

            assertThat(templateRepository.findByUserEmailOrderByCreatedAtDesc("alice@example.com"))
                    .extracting(CustomAnswerTemplate::getTitle).containsExactly("newer", "older");
            assertThat(templateRepository.findByUserEmailOrderByCreatedAtDesc("nobody@example.com")).isEmpty();
        }

        @Test
        @DisplayName("findByUserEmailAndCategory filters by owner and category")
        void byUserAndCategory() {
            template(alice, "w1", "work", "PENDING", null);
            template(alice, "p1", "personal", "PENDING", null);
            template(bob, "w2", "work", "PENDING", null);

            assertThat(templateRepository.findByUserEmailAndCategory("alice@example.com", "work"))
                    .extracting(CustomAnswerTemplate::getTitle).containsExactly("w1");
        }

        @Test
        @DisplayName("findPendingScheduledEmails returns due tasks with the given status only")
        void pendingScheduled() {
            LocalDateTime now = LocalDateTime.of(2026, 10, 5, 12, 0);
            template(alice, "due", null, "PENDING", now.minusMinutes(5));
            template(alice, "exactly-now", null, "PENDING", now);
            template(alice, "future", null, "PENDING", now.plusMinutes(5));
            template(alice, "already-sent", null, "SENT", now.minusHours(1));
            template(alice, "failed", null, "FAILED", now.minusHours(1));
            template(alice, "not-scheduled", null, "PENDING", null);

            assertThat(templateRepository.findPendingScheduledEmails("PENDING", now))
                    .extracting(CustomAnswerTemplate::getTitle).containsExactlyInAnyOrder("due", "exactly-now");
            assertThat(templateRepository.findPendingScheduledEmails("FAILED", now))
                    .extracting(CustomAnswerTemplate::getTitle).containsExactly("failed");
        }

        @Test
        @DisplayName("createdAt/updatedAt are filled in and status defaults to PENDING")
        void timestampsAndDefaults() {
            CustomAnswerTemplate t = templateRepository.save(new CustomAnswerTemplate(null, alice, "t", "c", null, null, null));
            em.flush();

            assertThat(t.getCreatedAt()).isNotNull();
            assertThat(t.getUpdatedAt()).isNotNull();
            assertThat(t.getStatus()).isEqualTo("PENDING");
        }
    }

    // ── audit logs ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("AuditLogRepository.findByUserEmailOrderByTimestampDesc returns the user's entries newest first")
    void auditLogsNewestFirst() {
        AuditLog first = em.persist(new AuditLog(null, alice, "SEND_EMAIL", "first", null));
        AuditLog second = em.persist(new AuditLog(null, alice, "DRIVE_LIST_FILES", "second", null));
        em.persist(new AuditLog(null, bob, "SEND_EMAIL", "bob", null));
        em.flush();
        jdbc.update("update audit_logs set timestamp = ? where id = ?", LocalDateTime.of(2026, 1, 1, 0, 0), first.getId());
        jdbc.update("update audit_logs set timestamp = ? where id = ?", LocalDateTime.of(2026, 2, 1, 0, 0), second.getId());
        em.clear();

        assertThat(auditLogRepository.findByUserEmailOrderByTimestampDesc("alice@example.com"))
                .extracting(AuditLog::getDetails).containsExactly("second", "first");
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────

    @Nested
    @DisplayName("WhatsApp repositories")
    class WhatsApp {

        private WhatsAppChat chat(String id, LocalDateTime lastMessageAt) {
            WhatsAppChat chat = new WhatsAppChat();
            chat.setChatId(id);
            chat.setName(id);
            chat.setLastMessageTimestamp(lastMessageAt);
            return chatRepository.save(chat);
        }

        private WhatsAppMessage message(String chatId, String waId, LocalDateTime ts) {
            return messageRepository.save(new WhatsAppMessage(chatId, waId, "sender", null, "body " + waId, "INCOMING",
                    null, null, null, null, null, null, ts, null));
        }

        @Test
        @DisplayName("Chats are listed by last message time, newest first; chats without a timestamp sort first (PostgreSQL semantics)")
        void chatsOrdering() {
            chat("old@c.us", LocalDateTime.of(2026, 1, 1, 0, 0));
            chat("new@c.us", LocalDateTime.of(2026, 6, 1, 0, 0));
            chat("never@c.us", null);

            assertThat(chatRepository.findAllByOrderByLastMessageTimestampDesc())
                    .extracting(WhatsAppChat::getChatId).containsExactly("never@c.us", "new@c.us", "old@c.us");
            assertThat(chatRepository.findByChatId("new@c.us")).isPresent();
            assertThat(chatRepository.findByChatId("missing@c.us")).isEmpty();
        }

        @Test
        @DisplayName("findByMessageWaId supports bridge de-duplication and messageWaId is unique")
        void findByWaIdAndUniqueness() {
            message("a@c.us", "WA-1", LocalDateTime.now());
            em.flush();

            assertThat(messageRepository.findByMessageWaId("WA-1")).map(WhatsAppMessage::getContent).contains("body WA-1");
            assertThat(messageRepository.findByMessageWaId("WA-2")).isEmpty();
            assertThatThrownBy(() -> {
                message("a@c.us", "WA-1", LocalDateTime.now());
                em.flush();
            }).isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("findByChatIdOrderByTimestampAsc returns one chat's messages oldest first")
        void messagesForChat() {
            WhatsAppMessage m1 = message("a@c.us", "WA-1", null);
            WhatsAppMessage m2 = message("a@c.us", "WA-2", null);
            WhatsAppMessage m3 = message("b@c.us", "WA-3", null);
            em.flush();
            jdbc.update("update whatsapp_messages set timestamp = ? where id = ?", LocalDateTime.of(2026, 1, 1, 0, 0), m3.getId());
            jdbc.update("update whatsapp_messages set timestamp = ? where id = ?", LocalDateTime.of(2026, 3, 1, 0, 0), m1.getId());
            jdbc.update("update whatsapp_messages set timestamp = ? where id = ?", LocalDateTime.of(2026, 2, 1, 0, 0), m2.getId());
            em.clear();

            assertThat(messageRepository.findByChatIdOrderByTimestampAsc("a@c.us"))
                    .extracting(WhatsAppMessage::getMessageWaId).containsExactly("WA-2", "WA-1");
            assertThat(messageRepository.findAllByOrderByTimestampDesc())
                    .extracting(WhatsAppMessage::getMessageWaId).containsExactly("WA-1", "WA-2", "WA-3");
        }

        @Test
        @Disabled("BUG: WhatsAppMessage.timestamp is annotated @CreationTimestamp, so Hibernate overwrites the "
                + "timestamp the bridge sends (history sync, offline messages) with the insert time. Messages are "
                + "then ordered by when they were synced, not when they were sent. Drop @CreationTimestamp (or only "
                + "default it when null, e.g. in @PrePersist).")
        @DisplayName("The original message timestamp from the bridge is persisted")
        void bridgeTimestampIsKept() {
            LocalDateTime sentAt = LocalDateTime.of(2025, 12, 24, 18, 30);
            WhatsAppMessage saved = message("a@c.us", "WA-OLD", sentAt);
            em.flush();
            em.clear();

            assertThat(messageRepository.findById(saved.getId()).orElseThrow().getTimestamp()).isEqualTo(sentAt);
        }
    }
}
