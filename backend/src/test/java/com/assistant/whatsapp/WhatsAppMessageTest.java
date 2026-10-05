package com.assistant.whatsapp;

import com.assistant.auth.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("WhatsAppMessage / WhatsAppChat - entity construction")
class WhatsAppMessageTest {

    @Test
    @DisplayName("Meta webhook constructor fills sender, content, direction and message SID")
    void webhookConstructor() {
        User user = new User();
        WhatsAppMessage msg = new WhatsAppMessage(user, "4915112345678", "Ana", "Hola", "INCOMING", "wamid.X");

        assertThat(msg.getUser()).isSameAs(user);
        assertThat(msg.getSenderId()).isEqualTo("4915112345678");
        assertThat(msg.getSenderName()).isEqualTo("Ana");
        assertThat(msg.getContent()).isEqualTo("Hola");
        assertThat(msg.getDirection()).isEqualTo("INCOMING");
        assertThat(msg.getMessageSid()).isEqualTo("wamid.X");
        assertThat(msg.getMessageWaId()).isNull();
        assertThat(msg.getIsEdited()).isFalse();
    }

    @Test
    @DisplayName("Bridge constructor maps every positional argument to the right field")
    void bridgeConstructor() {
        LocalDateTime ts = LocalDateTime.of(2026, 5, 1, 12, 30);
        WhatsAppMessage msg = new WhatsAppMessage("chat@g.us", "WA1", "sender@s.whatsapp.net", "Push",
                "body", "OUTGOING", "IMAGE", "BASE64", "image/jpeg", "Author", "+34600000000",
                "quoted", ts, "{raw}");

        assertThat(msg.getChatId()).isEqualTo("chat@g.us");
        assertThat(msg.getMessageWaId()).isEqualTo("WA1");
        assertThat(msg.getSenderId()).isEqualTo("sender@s.whatsapp.net");
        assertThat(msg.getSenderName()).isEqualTo("Push");
        assertThat(msg.getContent()).isEqualTo("body");
        assertThat(msg.getDirection()).isEqualTo("OUTGOING");
        assertThat(msg.getMediaType()).isEqualTo("IMAGE");
        assertThat(msg.getMediaBase64()).isEqualTo("BASE64");
        assertThat(msg.getMediaMimetype()).isEqualTo("image/jpeg");
        assertThat(msg.getAuthorName()).isEqualTo("Author");
        assertThat(msg.getAuthorPhone()).isEqualTo("+34600000000");
        assertThat(msg.getRepliedToContent()).isEqualTo("quoted");
        assertThat(msg.getTimestamp()).isEqualTo(ts);
        assertThat(msg.getRawPayload()).isEqualTo("{raw}");
        assertThat(msg.getMessageSid()).isNull();
    }

    @Test
    @DisplayName("A new chat is not a group and has no unread messages")
    void chatDefaults() {
        WhatsAppChat chat = new WhatsAppChat();

        assertThat(chat.isGroup()).isFalse();
        assertThat(chat.getUnreadCount()).isZero();
        chat.setGroup(true);
        assertThat(chat.isGroup()).isTrue();
    }
}
