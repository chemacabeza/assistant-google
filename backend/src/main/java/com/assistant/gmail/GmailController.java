package com.assistant.gmail;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/gmail")
public class GmailController {

    private final GmailService gmailService;

    @GetMapping("/messages")
    public ResponseEntity<?> getMessages(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int maxResults) {
        return ResponseEntity.ok(gmailService.listMessages(q, maxResults));
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<?> getMessageDetails(@PathVariable String id) {
        return ResponseEntity.ok(gmailService.getMessage(id));
    }

    @PostMapping("/send")
    public ResponseEntity<?> sendEmail(@RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(gmailService.sendEmail(payload));
    }

    public GmailController(GmailService gmailService) {
        this.gmailService = gmailService;
    }
}
