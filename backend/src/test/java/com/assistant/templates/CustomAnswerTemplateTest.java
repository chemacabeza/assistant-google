package com.assistant.templates;

import com.assistant.auth.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("CustomAnswerTemplate - entity defaults and JSON shape")
class CustomAnswerTemplateTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    @DisplayName("New templates start as PENDING")
    void defaultsToPending() {
        assertThat(new CustomAnswerTemplate().getStatus()).isEqualTo("PENDING");
        assertThat(new CustomAnswerTemplate(1L, null, "t", "c", null, null, null).getStatus()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("The owning user is never serialized to JSON")
    void userIsNotSerialized() throws Exception {
        User user = new User(1L, "owner@example.com", "Owner", null, null, null);
        CustomAnswerTemplate template = new CustomAnswerTemplate(5L, user, "Title", "Body", "work",
                LocalDateTime.of(2026, 1, 1, 0, 0), null);

        String json = objectMapper.writeValueAsString(template);

        assertThat(json).contains("\"title\":\"Title\"").contains("\"status\":\"PENDING\"")
                .doesNotContain("owner@example.com").doesNotContain("\"user\"");
    }

    @Test
    @DisplayName("A JSON body cannot assign the owning user")
    void userCannotBeDeserialized() throws Exception {
        CustomAnswerTemplate template = objectMapper.readValue(
                "{\"title\":\"T\",\"content\":\"C\",\"user\":{\"id\":2,\"email\":\"other@example.com\"}}",
                CustomAnswerTemplate.class);

        assertThat(template.getUser()).isNull();
        assertThat(template.getTitle()).isEqualTo("T");
    }
}
