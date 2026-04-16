package com.assistant.audit;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final AuditLogRepository auditLogRepository;

    @GetMapping
    public ResponseEntity<?> getAuditLogs(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) {
            return ResponseEntity.status(401).build();
        }
        String email = principal.getAttribute("email");
        List<AuditLog> logs = auditLogRepository.findByUserEmailOrderByTimestampDesc(email);

        // Map entity to a safe DTO to avoid exposing user internals
        List<Map<String, Object>> result = logs.stream().map(log -> Map.<String, Object>of(
            "id", log.getId(),
            "actionType", log.getActionType(),
            "details", log.getDetails() != null ? log.getDetails() : "",
            "timestamp", log.getTimestamp().toString()
        )).collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    public AuditController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }
}
