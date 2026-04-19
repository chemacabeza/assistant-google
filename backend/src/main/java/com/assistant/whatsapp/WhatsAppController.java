package com.assistant.whatsapp;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

    /**
     * Send a WhatsApp message via the whatsapp-bridge service.
     */
    @PostMapping("/send")
    public ResponseEntity<Object> sendMessage(@RequestBody Map<String, String> request) {
        String to      = request.get("to");
        String content = request.get("content");

        if (to == null || content == null) {
            return ResponseEntity.badRequest().build();
        }

        Map<String, Object> result = whatsappService.sendTextMessage(to, content);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(result);
        }
        return ResponseEntity.ok(result);
    }
}
