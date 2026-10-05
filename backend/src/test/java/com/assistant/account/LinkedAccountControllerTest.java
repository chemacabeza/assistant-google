package com.assistant.account;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(LinkedAccountController.class)
@DisplayName("LinkedAccountController - /api/accounts")
class LinkedAccountControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private LinkedAccountService service;

    @Test
    @DisplayName("GET lists linked accounts")
    void list() throws Exception {
        LinkedAccount a = new LinkedAccount("a@example.com", "A");
        a.setId(1L);
        when(service.getAllAccounts()).thenReturn(List.of(a));

        mockMvc.perform(get("/api/accounts").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].email").value("a@example.com"));
    }

    @Test
    @DisplayName("POST adds an account")
    void add() throws Exception {
        LinkedAccount saved = new LinkedAccount("b@example.com", "B");
        saved.setId(2L);
        when(service.addAccount(any())).thenReturn(saved);

        mockMvc.perform(post("/api/accounts").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"b@example.com\",\"name\":\"B\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(2));

        ArgumentCaptor<LinkedAccount> captor = ArgumentCaptor.forClass(LinkedAccount.class);
        verify(service).addAccount(captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("b@example.com");
    }

    @Test
    @DisplayName("POST of a duplicate answers 400 with the reason as plain text")
    void addDuplicate() throws Exception {
        when(service.addAccount(any())).thenThrow(new IllegalArgumentException("Account with this email already exists"));

        mockMvc.perform(post("/api/accounts").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"dup@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string("Account with this email already exists"));
    }

    @Test
    @DisplayName("DELETE removes the account by id")
    void remove() throws Exception {
        mockMvc.perform(delete("/api/accounts/4").with(user()).with(csrf())).andExpect(status().isOk());

        verify(service).deleteAccount(4L);
    }

    @Test
    @DisplayName("Requires a session; mutations require CSRF")
    void security() throws Exception {
        mockMvc.perform(get("/api/accounts")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/accounts").with(user()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/accounts/1").with(user())).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
