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
import static org.mockito.ArgumentMatchers.eq;
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
    @DisplayName("GET lists the signed-in user's linked accounts without exposing the owner")
    void list() throws Exception {
        LinkedAccount a = new LinkedAccount("a@example.com", "A");
        a.setId(1L);
        a.setOwnerEmail("owner@example.com");
        when(service.getAccounts("owner@example.com")).thenReturn(List.of(a));

        mockMvc.perform(get("/api/accounts").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].email").value("a@example.com"))
                .andExpect(jsonPath("$[0].ownerEmail").doesNotExist());
    }

    @Test
    @DisplayName("POST adds an account for the signed-in user")
    void add() throws Exception {
        LinkedAccount saved = new LinkedAccount("b@example.com", "B");
        saved.setId(2L);
        when(service.addAccount(eq("owner@example.com"), any())).thenReturn(saved);

        mockMvc.perform(post("/api/accounts").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"b@example.com\",\"name\":\"B\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(2));

        ArgumentCaptor<LinkedAccount> captor = ArgumentCaptor.forClass(LinkedAccount.class);
        verify(service).addAccount(eq("owner@example.com"), captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("b@example.com");
    }

    @Test
    @DisplayName("POST of a duplicate answers 400 with the reason as plain text")
    void addDuplicate() throws Exception {
        when(service.addAccount(any(), any())).thenThrow(new IllegalArgumentException("Account with this email already exists"));

        mockMvc.perform(post("/api/accounts").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"dup@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string("Account with this email already exists"));
    }

    @Test
    @DisplayName("DELETE removes the signed-in user's account by id")
    void remove() throws Exception {
        when(service.deleteAccount("owner@example.com", 4L)).thenReturn(true);

        mockMvc.perform(delete("/api/accounts/4").with(user()).with(csrf())).andExpect(status().isOk());
    }

    @Test
    @DisplayName("DELETE of another user's (or a missing) account answers 404")
    void removeForeign() throws Exception {
        when(service.deleteAccount("intruder@example.com", 4L)).thenReturn(false);

        mockMvc.perform(delete("/api/accounts/4").with(user("intruder@example.com")).with(csrf()))
                .andExpect(status().isNotFound());
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
