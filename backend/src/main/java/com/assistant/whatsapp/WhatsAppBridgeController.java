package com.assistant.whatsapp;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * WhatsAppBridgeController — receives events from the whatsapp-bridge Node.js service
 * and exposes APIs for the frontend to fetch chats and messages from the real WhatsApp account.
 */
@RestController
@RequestMapping("/api/whatsapp")
public class WhatsAppBridgeController {

    private final WhatsAppChatRepository chatRepository;
    private final WhatsAppMessageRepository messageRepository;

    public WhatsAppBridgeController(WhatsAppChatRepository chatRepository,
                                    WhatsAppMessageRepository messageRepository) {
        this.chatRepository = chatRepository;
        this.messageRepository = messageRepository;
    }

    // ─── Bridge Ingest: Chat Sync ─────────────────────────────────────────────

    @PostMapping("/bridge/chat")
    public ResponseEntity<Void> ingestChat(@RequestBody Map<String, Object> payload) {
        String chatId = (String) payload.get("chatId");
        if (chatId == null) return ResponseEntity.badRequest().build();

        WhatsAppChat chat = chatRepository.findByChatId(chatId).orElse(new WhatsAppChat());
        chat.setChatId(chatId);
        chat.setName((String) payload.getOrDefault("name", "Unknown"));
        chat.setGroup(Boolean.TRUE.equals(payload.get("isGroup")));
        chat.setAvatarUrl((String) payload.get("avatarUrl"));
        chat.setLastMessage((String) payload.getOrDefault("lastMessage", ""));
        chat.setUnreadCount(((Number) payload.getOrDefault("unreadCount", 0)).intValue());
        chat.setUpdatedAt(LocalDateTime.now());

        String tsStr = (String) payload.get("lastMessageTimestamp");
        if (tsStr != null) {
            try {
                chat.setLastMessageTimestamp(OffsetDateTime.parse(tsStr).toLocalDateTime());
            } catch (Exception e) {
                chat.setLastMessageTimestamp(LocalDateTime.now());
            }
        }

        chatRepository.save(chat);
        return ResponseEntity.ok().build();
    }

    // ─── Bridge Ingest: Message Sync ─────────────────────────────────────────

    @PostMapping("/bridge/message")
    public ResponseEntity<Void> ingestMessage(@RequestBody Map<String, Object> payload) {
        String messageWaId = (String) payload.get("messageId");
        if (messageWaId == null) return ResponseEntity.badRequest().build();

        // Deduplication — skip if already stored
        Optional<WhatsAppMessage> existing = messageRepository.findByMessageWaId(messageWaId);
        if (existing.isPresent()) return ResponseEntity.ok().build();

        String chatId     = (String) payload.get("chatId");
        String senderId   = (String) payload.getOrDefault("senderId", "unknown");
        String senderName = (String) payload.get("chatName");
        String body       = (String) payload.getOrDefault("body", "");
        boolean fromMe    = Boolean.TRUE.equals(payload.get("fromMe"));
        String direction  = fromMe ? "OUTGOING" : "INCOMING";
        String mediaType  = (String) payload.get("mediaType");
        String authorName = (String) payload.get("authorName");
        String authorPhone = (String) payload.get("authorPhone");
        String quotedMsg  = (String) payload.get("quotedMsg");

        // Media
        String mediaBase64 = null;
        String mediaMimetype = null;
        @SuppressWarnings("unchecked")
        Map<String, Object> mediaData = (Map<String, Object>) payload.get("mediaData");
        if (mediaData != null) {
            mediaBase64 = (String) mediaData.get("data");
            mediaMimetype = (String) mediaData.get("mimetype");
        }

        // Timestamp
        LocalDateTime timestamp = LocalDateTime.now();
        String tsStr = (String) payload.get("timestamp");
        if (tsStr != null) {
            try {
                timestamp = OffsetDateTime.parse(tsStr).toLocalDateTime();
            } catch (Exception ignored) {}
        }

        WhatsAppMessage msg = new WhatsAppMessage(
            chatId, messageWaId, senderId, senderName,
            body, direction, mediaType,
            mediaBase64, mediaMimetype,
            authorName, authorPhone,
            quotedMsg, timestamp
        );

        messageRepository.save(msg);

        // Update chat's last message
        if (chatId != null) {
            final LocalDateTime finalTimestamp = timestamp;
            final String finalBody = body;
            final String finalMediaType = mediaType;
            chatRepository.findByChatId(chatId).ifPresent(chat -> {
                chat.setLastMessage(finalBody.isEmpty() && finalMediaType != null ? "📎 " + finalMediaType.toLowerCase() : finalBody);
                chat.setLastMessageTimestamp(finalTimestamp);
                chat.setUpdatedAt(LocalDateTime.now());
                chatRepository.save(chat);
            });
        }

        return ResponseEntity.ok().build();
    }

    // ─── Frontend API: Get All Chats ──────────────────────────────────────────

    @GetMapping("/chats")
    public List<WhatsAppChat> getAllChats() {
        return chatRepository.findAllByOrderByLastMessageTimestampDesc();
    }

    // ─── Frontend API: Get Messages for a Chat ────────────────────────────────

    @GetMapping("/chats/{chatId}/messages")
    public List<WhatsAppMessage> getMessagesForChat(@PathVariable String chatId) {
        return messageRepository.findByChatIdOrderByTimestampAsc(chatId);
    }
}
