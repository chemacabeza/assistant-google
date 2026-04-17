package com.assistant.whatsapp;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/whatsapp/messages")
public class WhatsAppController {

    private final WhatsAppMessageRepository repository;
    private final WhatsAppService whatsappService;

    public WhatsAppController(WhatsAppMessageRepository repository, WhatsAppService whatsappService) {
        this.repository = repository;
        this.whatsappService = whatsappService;
    }

    @GetMapping
    public List<WhatsAppMessage> getAllMessages() {
        return repository.findAllByOrderByTimestampDesc();
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppMessage> sendMessage(@RequestBody Map<String, String> request) {
        String to = request.get("to");
        String content = request.get("content");

        if (to == null || content == null) {
            return ResponseEntity.badRequest().build();
        }

        // 1. Trigger the actual WhatsApp API call
        whatsappService.sendTextMessage(to, content);

        // 2. Persist to our internal audit log/database
        WhatsAppMessage waMsg = new WhatsAppMessage(
            null,
            "ME", // Marking as outgoing from "ME"
            "AI Assistant",
            content,
            "OUTGOING",
            "msg_" + System.currentTimeMillis() // Temporary ID until we get callback
        );
        waMsg.setRecipientId(to);
        
        WhatsAppMessage saved = repository.save(waMsg);
        return ResponseEntity.ok(saved);
    }
}
