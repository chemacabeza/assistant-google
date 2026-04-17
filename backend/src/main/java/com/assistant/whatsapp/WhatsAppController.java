package com.assistant.whatsapp;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/whatsapp/messages")
public class WhatsAppController {

    private final WhatsAppMessageRepository repository;

    public WhatsAppController(WhatsAppMessageRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<WhatsAppMessage> getAllMessages() {
        return repository.findAllByOrderByTimestampDesc();
    }
}
