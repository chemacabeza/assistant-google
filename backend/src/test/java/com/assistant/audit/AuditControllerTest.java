package com.assistant.audit;

import com.assistant.auth.User;
import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDateTime;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuditController.class)
@DisplayName("AuditController - /api/audit")
class AuditControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private AuditLogRepository auditLogRepository;

    @Test
    @DisplayName("Returns the signed-in user's audit trail as a DTO without user internals")
    void listsAuditLogs() throws Exception {
        User user = new User(1L, "owner@example.com", "Owner", "https://pic", null, null);
        when(auditLogRepository.findByUserEmailOrderByTimestampDesc("owner@example.com")).thenReturn(List.of(
                new AuditLog(2L, user, "SEND_EMAIL", "Executed sendEmail", LocalDateTime.of(2026, 10, 5, 9, 30)),
                new AuditLog(1L, user, "DRIVE_LIST_FILES", null, LocalDateTime.of(2026, 10, 4, 8, 0))));

        mockMvc.perform(get("/api/audit").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(2))
                .andExpect(jsonPath("$[0].actionType").value("SEND_EMAIL"))
                .andExpect(jsonPath("$[0].details").value("Executed sendEmail"))
                .andExpect(jsonPath("$[0].timestamp").value("2026-10-05T09:30"))
                .andExpect(jsonPath("$[0].user").doesNotExist())
                .andExpect(jsonPath("$[1].details").value(""));
    }

    @Test
    @DisplayName("Answers 401 for anonymous callers")
    void requiresAuth() throws Exception {
        mockMvc.perform(get("/api/audit")).andExpect(status().isUnauthorized());
        verifyNoInteractions(auditLogRepository);
    }
}
