package com.assistant.whatsapp;

import com.assistant.auth.User;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "whatsapp_messages")
public class WhatsAppMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String senderId; // The phone number of the sender

    private String senderName; // The profile name of the sender from Meta

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false)
    private String direction; // "INCOMING" or "OUTGOING"

    private String messageSid; // WhatsApp Message ID (Meta or native)

    @Column(unique = true)
    private String messageWaId; // Native whatsapp-web.js message ID (for dedup)

    private String chatId; // Conversation ID from whatsapp-bridge

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime timestamp;

    @Column(columnDefinition = "TEXT")
    private String repliedToContent;

    private Boolean isEdited = false;

    @Column(columnDefinition = "TEXT")
    private String mediaMetadata;

    private String recipientId;

    private String mediaType; // IMAGE, VIDEO, AUDIO, DOCUMENT, STICKER, etc.

    @Column(columnDefinition = "TEXT")
    private String mediaBase64; // Base64-encoded media data for inline display

    private String mediaMimetype; // e.g. "image/jpeg"

    private String authorName; // For group messages: sender's display name

    private String authorPhone; // For group messages: sender's phone number

    @Column(columnDefinition = "TEXT")
    private String rawPayload; // Raw Baileys message for late-downloading media

    public WhatsAppMessage() {}

    public WhatsAppMessage(User user, String senderId, String senderName, String content, String direction, String messageSid) {
        this.user = user;
        this.senderId = senderId;
        this.senderName = senderName;
        this.content = content;
        this.direction = direction;
        this.messageSid = messageSid;
    }

    // Bridge constructor
    public WhatsAppMessage(String chatId, String messageWaId, String senderId, String senderName,
                           String content, String direction, String mediaType,
                           String mediaBase64, String mediaMimetype,
                           String authorName, String authorPhone,
                           String repliedToContent, LocalDateTime timestamp,
                           String rawPayload) {
        this.chatId = chatId;
        this.messageWaId = messageWaId;
        this.senderId = senderId;
        this.senderName = senderName;
        this.content = content;
        this.direction = direction;
        this.mediaType = mediaType;
        this.mediaBase64 = mediaBase64;
        this.mediaMimetype = mediaMimetype;
        this.authorName = authorName;
        this.authorPhone = authorPhone;
        this.repliedToContent = repliedToContent;
        this.timestamp = timestamp;
        this.rawPayload = rawPayload;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getSenderId() { return senderId; }
    public void setSenderId(String senderId) { this.senderId = senderId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }
    public String getMessageSid() { return messageSid; }
    public void setMessageSid(String messageSid) { this.messageSid = messageSid; }
    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }
    public String getRepliedToContent() { return repliedToContent; }
    public void setRepliedToContent(String repliedToContent) { this.repliedToContent = repliedToContent; }
    public Boolean getIsEdited() { return isEdited; }
    public void setIsEdited(Boolean isEdited) { this.isEdited = isEdited; }
    public String getMediaMetadata() { return mediaMetadata; }
    public void setMediaMetadata(String mediaMetadata) { this.mediaMetadata = mediaMetadata; }
    public String getRecipientId() { return recipientId; }
    public void setRecipientId(String recipientId) { this.recipientId = recipientId; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getMessageWaId() { return messageWaId; }
    public void setMessageWaId(String messageWaId) { this.messageWaId = messageWaId; }
    public String getChatId() { return chatId; }
    public void setChatId(String chatId) { this.chatId = chatId; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public String getMediaBase64() { return mediaBase64; }
    public void setMediaBase64(String mediaBase64) { this.mediaBase64 = mediaBase64; }
    public String getMediaMimetype() { return mediaMimetype; }
    public void setMediaMimetype(String mediaMimetype) { this.mediaMimetype = mediaMimetype; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String authorName) { this.authorName = authorName; }
    public String getAuthorPhone() { return authorPhone; }
    public void setAuthorPhone(String authorPhone) { this.authorPhone = authorPhone; }
    public String getRawPayload() { return rawPayload; }
    public void setRawPayload(String rawPayload) { this.rawPayload = rawPayload; }
}
