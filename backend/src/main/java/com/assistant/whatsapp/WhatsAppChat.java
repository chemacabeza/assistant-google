package com.assistant.whatsapp;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "whatsapp_chats")
public class WhatsAppChat {

    @Id
    @Column(nullable = false, unique = true)
    private String chatId; // e.g. "33612345678@c.us" or "group-id@g.us"

    @Column(nullable = false)
    private String name;

    private boolean isGroup;

    @Column(columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(columnDefinition = "TEXT")
    private String lastMessage;

    private LocalDateTime lastMessageTimestamp;
    private String lastMessageDirection; // INCOMING or OUTGOING

    private int unreadCount;

    private LocalDateTime updatedAt;

    public WhatsAppChat() {}

    // Getters and Setters
    public String getChatId() { return chatId; }
    public void setChatId(String chatId) { this.chatId = chatId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isGroup() { return isGroup; }
    public void setGroup(boolean group) { isGroup = group; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getLastMessage() { return lastMessage; }
    public void setLastMessage(String lastMessage) { this.lastMessage = lastMessage; }
    public LocalDateTime getLastMessageTimestamp() { return lastMessageTimestamp; }
    public void setLastMessageTimestamp(LocalDateTime lastMessageTimestamp) { this.lastMessageTimestamp = lastMessageTimestamp; }
    public String getLastMessageDirection() { return lastMessageDirection; }
    public void setLastMessageDirection(String lastMessageDirection) { this.lastMessageDirection = lastMessageDirection; }
    public int getUnreadCount() { return unreadCount; }
    public void setUnreadCount(int unreadCount) { this.unreadCount = unreadCount; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
