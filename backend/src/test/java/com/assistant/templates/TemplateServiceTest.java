package com.assistant.templates;

import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TemplateService - per-user template CRUD")
class TemplateServiceTest {

    @Mock
    private CustomAnswerTemplateRepository templateRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private TemplateService templateService;

    private User owner;
    private CustomAnswerTemplate existing;

    @BeforeEach
    void setUp() {
        owner = new User(1L, "owner@example.com", "Owner", null, null, null);
        existing = new CustomAnswerTemplate(10L, owner, "Old title", "Old content", "work", null, null);
    }

    @Test
    @DisplayName("getUserTemplates delegates to the newest-first repository query")
    void getUserTemplates() {
        when(templateRepository.findByUserEmailOrderByCreatedAtDesc("owner@example.com")).thenReturn(List.of(existing));

        assertThat(templateService.getUserTemplates("owner@example.com")).containsExactly(existing);
    }

    @Test
    @DisplayName("createTemplate attaches the signed-in user and saves")
    void createTemplate() {
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(owner));
        when(templateRepository.save(any())).then(returnsFirstArg());
        CustomAnswerTemplate data = new CustomAnswerTemplate();
        data.setTitle("Hello");
        data.setContent("Body");

        CustomAnswerTemplate saved = templateService.createTemplate("owner@example.com", data);

        assertThat(saved.getUser()).isSameAs(owner);
        assertThat(saved.getTitle()).isEqualTo("Hello");
        assertThat(saved.getStatus()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("createTemplate answers 404 for an unknown user")
    void createTemplateUnknownUser() {
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> templateService.createTemplate("ghost@example.com", new CustomAnswerTemplate()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        verify(templateRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateTemplate copies every editable field onto the owner's template")
    void updateTemplate() {
        when(templateRepository.findById(10L)).thenReturn(Optional.of(existing));
        when(templateRepository.save(any())).then(returnsFirstArg());
        LocalDateTime sendAt = LocalDateTime.of(2026, 10, 6, 9, 0);
        CustomAnswerTemplate update = new CustomAnswerTemplate();
        update.setTitle("New title");
        update.setContent("New content");
        update.setCategory("personal");
        update.setFromEmail("me@example.com");
        update.setTargetEmail("you@example.com");
        update.setSendAt(sendAt);
        update.setStatus("SENT");

        CustomAnswerTemplate result = templateService.updateTemplate("owner@example.com", 10L, update);

        assertThat(result).isSameAs(existing);
        assertThat(result.getTitle()).isEqualTo("New title");
        assertThat(result.getContent()).isEqualTo("New content");
        assertThat(result.getCategory()).isEqualTo("personal");
        assertThat(result.getFromEmail()).isEqualTo("me@example.com");
        assertThat(result.getTargetEmail()).isEqualTo("you@example.com");
        assertThat(result.getSendAt()).isEqualTo(sendAt);
        assertThat(result.getStatus()).isEqualTo("SENT");
        assertThat(result.getUser()).isSameAs(owner);
    }

    @Test
    @DisplayName("updateTemplate keeps the current status when the update omits it")
    void updateTemplateKeepsStatus() {
        existing.setStatus("FAILED");
        when(templateRepository.findById(10L)).thenReturn(Optional.of(existing));
        when(templateRepository.save(any())).then(returnsFirstArg());
        CustomAnswerTemplate update = new CustomAnswerTemplate();
        update.setStatus(null);

        assertThat(templateService.updateTemplate("owner@example.com", 10L, update).getStatus()).isEqualTo("FAILED");
    }

    @Test
    @DisplayName("updateTemplate answers 404 for an unknown template")
    void updateTemplateNotFound() {
        when(templateRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> templateService.updateTemplate("owner@example.com", 99L, new CustomAnswerTemplate()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    @DisplayName("updateTemplate answers 403 and saves nothing when the template belongs to someone else")
    void updateTemplateForbidden() {
        when(templateRepository.findById(10L)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> templateService.updateTemplate("intruder@example.com", 10L, new CustomAnswerTemplate()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(templateRepository, never()).save(any());
        assertThat(existing.getTitle()).isEqualTo("Old title");
    }

    @Test
    @DisplayName("deleteTemplate removes the owner's template")
    void deleteTemplate() {
        when(templateRepository.findById(10L)).thenReturn(Optional.of(existing));

        templateService.deleteTemplate("owner@example.com", 10L);

        verify(templateRepository).delete(existing);
    }

    @Test
    @DisplayName("deleteTemplate answers 403 for someone else's template")
    void deleteTemplateForbidden() {
        when(templateRepository.findById(10L)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> templateService.deleteTemplate("intruder@example.com", 10L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(templateRepository, never()).delete(any());
    }

    @Test
    @DisplayName("deleteTemplate answers 404 for an unknown template")
    void deleteTemplateNotFound() {
        when(templateRepository.findById(5L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> templateService.deleteTemplate("owner@example.com", 5L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }
}
