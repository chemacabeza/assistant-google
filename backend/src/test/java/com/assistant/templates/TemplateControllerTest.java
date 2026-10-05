package com.assistant.templates;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TemplateController.class)
@DisplayName("TemplateController - /api/templates")
class TemplateControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private TemplateService templateService;

    private static CustomAnswerTemplate template(long id, String title) {
        CustomAnswerTemplate t = new CustomAnswerTemplate(id, null, title, "Body " + id, "work",
                LocalDateTime.of(2026, 10, 1, 9, 0), null);
        t.setTargetEmail("friend@example.com");
        return t;
    }

    @Test
    @DisplayName("GET lists the signed-in user's templates")
    void listTemplates() throws Exception {
        when(templateService.getUserTemplates("owner@example.com")).thenReturn(List.of(template(1, "A"), template(2, "B")));

        mockMvc.perform(get("/api/templates").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].title").value("A"))
                .andExpect(jsonPath("$[0].status").value("PENDING"))
                .andExpect(jsonPath("$[0].targetEmail").value("friend@example.com"))
                .andExpect(jsonPath("$[0].user").doesNotExist());
    }

    @Test
    @DisplayName("GET without a session answers 401")
    void listRequiresAuth() throws Exception {
        mockMvc.perform(get("/api/templates")).andExpect(status().isUnauthorized());

        verifyNoInteractions(templateService);
    }

    @Test
    @DisplayName("POST creates a template for the signed-in user")
    void createTemplate() throws Exception {
        when(templateService.createTemplate(eq("owner@example.com"), any())).thenReturn(template(5, "New"));

        mockMvc.perform(post("/api/templates").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"New\",\"content\":\"Hi\",\"sendAt\":\"2026-10-06T08:00:00\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5));

        ArgumentCaptor<CustomAnswerTemplate> body = ArgumentCaptor.forClass(CustomAnswerTemplate.class);
        verify(templateService).createTemplate(eq("owner@example.com"), body.capture());
        assertThat(body.getValue().getTitle()).isEqualTo("New");
        assertThat(body.getValue().getSendAt()).isEqualTo(LocalDateTime.of(2026, 10, 6, 8, 0));
    }

    @Test
    @DisplayName("POST without a CSRF token is rejected with 403")
    void createRequiresCsrf() throws Exception {
        mockMvc.perform(post("/api/templates").with(user())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(templateService);
    }

    @Test
    @DisplayName("POST with a malformed body answers 400 with the error JSON")
    void createMalformedBody() throws Exception {
        mockMvc.perform(post("/api/templates").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Malformed or missing request body"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("PUT on someone else's template answers 403 with the service's reason")
    void updateForbidden() throws Exception {
        when(templateService.updateTemplate(eq("owner@example.com"), eq(9L), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Not allowed to update this template"));

        mockMvc.perform(put("/api/templates/9").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Not allowed to update this template"));
    }

    @Test
    @DisplayName("PUT with a non-numeric id answers 400")
    void updateBadId() throws Exception {
        mockMvc.perform(put("/api/templates/abc").with(user()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'id'"));
    }

    @Test
    @DisplayName("DELETE removes the template and answers 200")
    void deleteTemplate() throws Exception {
        mockMvc.perform(delete("/api/templates/3").with(user()).with(csrf()))
                .andExpect(status().isOk());

        verify(templateService).deleteTemplate("owner@example.com", 3L);
    }

    @Test
    @DisplayName("DELETE of an unknown template answers 404")
    void deleteNotFound() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found"))
                .when(templateService).deleteTemplate("owner@example.com", 404L);

        mockMvc.perform(delete("/api/templates/404").with(user()).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Template not found"));
    }

    @Test
    @DisplayName("DELETE without CSRF is rejected")
    void deleteRequiresCsrf() throws Exception {
        mockMvc.perform(delete("/api/templates/3").with(user())).andExpect(status().isForbidden());

        verifyNoInteractions(templateService);
    }
}
