package com.assistant.whatsapp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

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
    private final WebClient webClient;

    @Value("${BRIDGE_URL:http://whatsapp-bridge:3001}")
    private String bridgeUrl;

    public WhatsAppBridgeController(WhatsAppChatRepository chatRepository,
                                    WhatsAppMessageRepository messageRepository,
                                    WebClient.Builder webClientBuilder) {
        this.chatRepository = chatRepository;
        this.messageRepository = messageRepository;
        this.webClient = webClientBuilder.build();
    }

    // ─── Bridge Proxy: Status ─────────────────────────────────────────────────

    @GetMapping("/bridge/status")
    public ResponseEntity<Map<String, Object>> getBridgeStatus() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> status = webClient.get()
                .uri(bridgeUrl + "/status")
                .retrieve()
                .bodyToMono(Map.class)
                .block(java.time.Duration.ofSeconds(3));
            return ResponseEntity.ok(status != null ? status : Map.of("authenticated", false, "ready", false, "hasQr", false));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("authenticated", false, "ready", false, "hasQr", false, "error", e.getMessage()));
        }
    }

    // ─── Bridge Proxy: QR Image ───────────────────────────────────────────────

    @GetMapping("/bridge/qr")
    public ResponseEntity<byte[]> getBridgeQr() {
        try {
            byte[] qrBytes = webClient.get()
                .uri(bridgeUrl + "/qr")
                .accept(MediaType.IMAGE_PNG)
                .retrieve()
                .bodyToMono(byte[].class)
                .block(java.time.Duration.ofSeconds(5));
            if (qrBytes == null || qrBytes.length == 0) {
                return ResponseEntity.noContent().build();
            }
            return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(qrBytes);
        } catch (WebClientResponseException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
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

    @GetMapping("/chats/{chatId:.+}/messages")
    public ResponseEntity<Object> getMessagesForChat(@PathVariable String chatId) {
        // First try the bridge directly (live, no DB lag)
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> bridgeMsgs = webClient.get()
                .uri(bridgeUrl + "/messages/" + java.net.URLEncoder.encode(chatId, java.nio.charset.StandardCharsets.UTF_8))
                .retrieve()
                .bodyToMono(List.class)
                .block(java.time.Duration.ofSeconds(15));
            if (bridgeMsgs != null && !bridgeMsgs.isEmpty()) {
                return ResponseEntity.ok(bridgeMsgs);
            }
        } catch (Exception e) {
            // Bridge unavailable or fetchMessages failed — fall through to DB
        }
        // Fallback: serve from DB (previously synced messages)
        return ResponseEntity.ok(messageRepository.findByChatIdOrderByTimestampAsc(chatId));
    }
}
