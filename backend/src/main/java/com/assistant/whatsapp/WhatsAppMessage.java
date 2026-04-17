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

    private String messageSid; // WhatsApp Message ID from Meta

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime timestamp;

    public WhatsAppMessage() {}

    public WhatsAppMessage(User user, String senderId, String senderName, String content, String direction, String messageSid) {
        this.user = user;
        this.senderId = senderId;
        this.senderName = senderName;
        this.content = content;
        this.direction = direction;
        this.messageSid = messageSid;
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
}
