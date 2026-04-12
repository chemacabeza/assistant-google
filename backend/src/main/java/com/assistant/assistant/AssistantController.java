package com.assistant.assistant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {

    private final AssistantRoutingService assistantRoutingService;

    public AssistantController(AssistantRoutingService assistantRoutingService) {
        this.assistantRoutingService = assistantRoutingService;
    }

    @PostMapping("/ask")
    public ResponseEntity<?> askAssistant(@RequestBody AssistantQuery request) {
        return ResponseEntity.ok(assistantRoutingService.parseIntent(request.getQuery()));
    }

    static class AssistantQuery {
        private String query;

        public AssistantQuery() {}

        public AssistantQuery(String query) {
            this.query = query;
        }

        public String getQuery() { return query; }
        public void setQuery(String query) { this.query = query; }
    }
}
