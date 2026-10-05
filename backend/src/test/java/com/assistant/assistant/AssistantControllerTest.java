package com.assistant.assistant;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AssistantController.class)
@DisplayName("AssistantController - /api/assistant/ask")
class AssistantControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private AssistantRoutingService assistantRoutingService;

    @Test
    @DisplayName("Passes query and history to the routing service and returns its answer")
    @SuppressWarnings("unchecked")
    void ask() throws Exception {
        when(assistantRoutingService.parseIntent(eq("Plan my trip"), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(Map.of("action", "CHAT", "response", "Done", "rawQuery", "Plan my trip"));

        mockMvc.perform(post("/api/assistant/ask").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"Plan my trip\",\"history\":[{\"role\":\"user\",\"content\":\"hi\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("CHAT"))
                .andExpect(jsonPath("$.response").value("Done"));

        ArgumentCaptor<List<Map<String, String>>> history = ArgumentCaptor.forClass(List.class);
        verify(assistantRoutingService).parseIntent(eq("Plan my trip"), history.capture());
        assertThat(history.getValue()).containsExactly(Map.of("role", "user", "content", "hi"));
    }

    @Test
    @DisplayName("History is optional")
    void askWithoutHistory() throws Exception {
        when(assistantRoutingService.parseIntent("hi", null)).thenReturn(Map.of("action", "CHAT", "response", "Hello"));

        mockMvc.perform(post("/api/assistant/ask").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"hi\"}"))
                .andExpect(status().isOk());

        verify(assistantRoutingService).parseIntent(eq("hi"), isNull());
    }

    @Test
    @DisplayName("Requires a session and a CSRF token")
    void securedEndpoint() throws Exception {
        mockMvc.perform(post("/api/assistant/ask").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/assistant/ask").with(user()).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"x\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(assistantRoutingService);
    }

    @Test
    @DisplayName("A non-JSON body answers 415, a missing body 400")
    void badBodies() throws Exception {
        mockMvc.perform(post("/api/assistant/ask").with(user()).with(csrf()).contentType(MediaType.TEXT_PLAIN).content("hi"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.message").value("Unsupported content type"));
        mockMvc.perform(post("/api/assistant/ask").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }
}
