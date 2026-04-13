package com.assistant.assistant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {

    private final AssistantRoutingService assistantRoutingService;

    public AssistantController(AssistantRoutingService assistantRoutingService) {
        this.assistantRoutingService = assistantRoutingService;
    }

    @PostMapping("/ask")
    public ResponseEntity<?> askAssistant(@RequestBody AssistantQuery request) {
        return ResponseEntity.ok(assistantRoutingService.parseIntent(request.getQuery(), request.getHistory()));
    }

    static class AssistantQuery {
        private String query;
        private List<Map<String, String>> history;

        public AssistantQuery() {}

        public AssistantQuery(String query, List<Map<String, String>> history) {
            this.query = query;
            this.history = history;
        }

        public String getQuery() { return query; }
        public void setQuery(String query) { this.query = query; }
        
        public List<Map<String, String>> getHistory() { return history; }
        public void setHistory(List<Map<String, String>> history) { this.history = history; }
    }
}
