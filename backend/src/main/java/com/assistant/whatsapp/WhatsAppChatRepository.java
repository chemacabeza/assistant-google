package com.assistant.whatsapp;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface WhatsAppChatRepository extends JpaRepository<WhatsAppChat, String> {
    List<WhatsAppChat> findAllByOrderByLastMessageTimestampDesc();
    Optional<WhatsAppChat> findByChatId(String chatId);
}
