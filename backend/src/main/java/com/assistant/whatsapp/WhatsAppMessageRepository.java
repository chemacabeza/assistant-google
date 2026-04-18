package com.assistant.whatsapp;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WhatsAppMessageRepository extends JpaRepository<WhatsAppMessage, Long> {
    List<WhatsAppMessage> findAllByOrderByTimestampDesc();
    List<WhatsAppMessage> findByChatIdOrderByTimestampAsc(String chatId);
    Optional<WhatsAppMessage> findByMessageWaId(String messageWaId);
}
