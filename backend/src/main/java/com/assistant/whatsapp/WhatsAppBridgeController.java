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

        String  chatId     = (String)  payload.get("chatId");
        String  senderId   = (String)  payload.getOrDefault("senderId", "unknown");
        String  senderName = (String)  payload.get("chatName");   // push name
        String  body       = (String)  payload.getOrDefault("body", "");
        boolean fromMe     = Boolean.TRUE.equals(payload.get("fromMe"));
        boolean isGroup    = Boolean.TRUE.equals(payload.get("isGroup"));
        String  direction  = fromMe ? "OUTGOING" : "INCOMING";
        String  mediaType  = (String)  payload.get("mediaType");
        String  authorName = (String)  payload.get("authorName");
        String  authorPhone= (String)  payload.get("authorPhone");
        String  quotedMsg  = (String)  payload.get("quotedMsg");
        String  rawPayload = (String)  payload.get("rawPayload");

        // Media
        String mediaBase64 = null;
        String mediaMimetype = null;
        @SuppressWarnings("unchecked")
        Map<String, Object> mediaData = (Map<String, Object>) payload.get("mediaData");
        if (mediaData != null) {
            mediaBase64  = (String) mediaData.get("data");
            mediaMimetype= (String) mediaData.get("mimetype");
        }

        // Timestamp
        LocalDateTime timestamp = LocalDateTime.now();
        String tsStr = (String) payload.get("timestamp");
        if (tsStr != null) {
            try { timestamp = OffsetDateTime.parse(tsStr).toLocalDateTime(); }
            catch (Exception ignored) {}
        }

        WhatsAppMessage msg = new WhatsAppMessage(
            chatId, messageWaId, senderId, senderName,
            body, direction, mediaType,
            mediaBase64, mediaMimetype,
            authorName, authorPhone,
            quotedMsg, timestamp,
            rawPayload
        );
        messageRepository.save(msg);

        // ── Update the parent chat's metadata ──────────────────────────────────
        if (chatId != null) {
            final LocalDateTime ts        = timestamp;
            final String        finalBody = body;
            final String        mt        = mediaType;
            final String        pushName  = senderName;
            final boolean       incoming  = !fromMe;
            final boolean       group     = isGroup;

            chatRepository.findByChatId(chatId).ifPresent(chat -> {
                // ① Resolve display name for 1:1 chats from incoming message push name
                //    (push name = the contact's own WhatsApp display name)
                if (!group && incoming && pushName != null && !pushName.isBlank()) {
                    String cur = chat.getName();
                    boolean curIsPhone = cur == null || cur.matches("[+\\d\\s\\-\\.]+");
                    boolean newIsReal  = !pushName.matches("[+\\d\\s\\-\\.]+");
                    if (curIsPhone && newIsReal) {
                        chat.setName(pushName);
                    }
                }
                // ② Resolve group display name from message's chatName field
                //    (group messages carry the group name as chatName)
                if (group && pushName != null && !pushName.isBlank()) {
                    String cur = chat.getName();
                    boolean curIsPhone = cur == null || cur.matches("[+\\d\\s\\-\\.]+");
                    if (curIsPhone) chat.setName(pushName);
                }
                // ③ Update last-message preview and timestamp
                String preview = (!finalBody.isEmpty())
                    ? finalBody
                    : (mt != null ? "📎 " + mt.toLowerCase() : "");
                chat.setLastMessage(preview);
                chat.setLastMessageTimestamp(ts);
                chat.setUpdatedAt(LocalDateTime.now());
                chatRepository.save(chat);
            });
        }

        return ResponseEntity.ok().build();
    }
    @PostMapping("/bridge/chat-preview")
    public ResponseEntity<Void> updateChatPreview(@RequestBody Map<String, Object> payload) {
        String chatId = (String) payload.get("chatId");
        String lastMsg = (String) payload.get("lastMessage");
        String tsStr = (String) payload.get("lastMessageTimestamp");
        String direction = (String) payload.get("lastMessageDirection");
        String pushName = (String) payload.get("pushName");

        if (chatId == null) return ResponseEntity.badRequest().build();

        chatRepository.findByChatId(chatId).ifPresentOrElse(chat -> {
            if (lastMsg != null) chat.setLastMessage(lastMsg);
            if (tsStr != null) {
                try {
                    chat.setLastMessageTimestamp(LocalDateTime.parse(tsStr.substring(0, 19)));
                } catch (Exception ignored) {}
            }
            if (direction != null) chat.setLastMessageDirection(direction);
            
            // Resolve name from pushName if currently a phone number
            if (pushName != null && !pushName.isBlank()) {
                String cur = chat.getName();
                boolean isPhone = cur == null || cur.matches("[+\\d\\s\\-\\.]+");
                if (isPhone) chat.setName(pushName);
            }
            
            chat.setUpdatedAt(LocalDateTime.now());
            chatRepository.save(chat);
        }, () -> {
            // If chat doesn't exist, create it (happens during history sync sometimes)
            WhatsAppChat chat = new WhatsAppChat();
            chat.setChatId(chatId);
            chat.setName(pushName != null ? pushName : chatId.split("@")[0]);
            chat.setLastMessage(lastMsg);
            if (tsStr != null) {
                try {
                    chat.setLastMessageTimestamp(LocalDateTime.parse(tsStr.substring(0, 19)));
                } catch (Exception ignored) {}
            }
            chat.setLastMessageDirection(direction);
            chat.setUpdatedAt(LocalDateTime.now());
            chatRepository.save(chat);
        });

        return ResponseEntity.ok().build();
    }



    // ─── Frontend API: Get All Chats ──────────────────────────────────────────

    @GetMapping("/chats")
    public List<WhatsAppChat> getAllChats() {
        return chatRepository.findAll();
    }

    // ─── Frontend API: Get Messages for a Chat ────────────────────────────────
    // With Baileys, all messages are pushed into the DB via /bridge/message.
    // We serve directly from PostgreSQL — no live bridge proxy needed.

    @GetMapping("/chats/{chatId:.+}/messages")
    public ResponseEntity<Object> getMessagesForChat(@PathVariable String chatId) {
        List<WhatsAppMessage> messages = messageRepository.findByChatIdOrderByTimestampAsc(chatId);
        return ResponseEntity.ok(messages);
    }

    // ─── Bridge Ingest: Contact Name Update ───────────────────────────────────
    // Called by the contacts.upsert Baileys event to patch display names.
    // Only updates the name field — preserves all other chat data.

    @PostMapping("/bridge/contact-name")
    public ResponseEntity<Void> updateContactName(@RequestBody Map<String, Object> payload) {
        String chatId = (String) payload.get("chatId");
        String name   = (String) payload.get("name");
        if (chatId == null || name == null || name.isBlank()) return ResponseEntity.badRequest().build();

        chatRepository.findByChatId(chatId).ifPresent(chat -> {
            // Only update if currently a phone number, raw JID, or numeric ID
            String cur = chat.getName();
            boolean isReplaceable = cur == null || 
                              cur.matches("[+\\d\\s\\-\\.]+") || // Raw numbers
                              cur.matches("\\d{10,}") ||      // Long numeric IDs
                              cur.contains("@") ||              // Full JIDs
                              cur.contains("-");                // JIDs with hyphen (common in groups)
            
            if (isReplaceable) {
                chat.setName(name);
                chat.setUpdatedAt(LocalDateTime.now());
                chatRepository.save(chat);
            }
        });
        return ResponseEntity.ok().build();
    }

    @GetMapping("/messages/wa/{waId}")
    public ResponseEntity<WhatsAppMessage> getMessageByWaId(@PathVariable String waId) {
        return messageRepository.findByMessageWaId(waId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Nuclear Clear: wipe all WhatsApp data from the database.
     * Called by the bridge during a Hard Reset.
     */
    @PostMapping("/bridge/clear-all")
    public ResponseEntity<Void> clearAllData() {
        System.out.println("[Backend] ☢️ Nuclear Clear: Wiping all WhatsApp messages and chats...");
        messageRepository.deleteAll();
        chatRepository.deleteAll();
        return ResponseEntity.ok().build();
    }

}

