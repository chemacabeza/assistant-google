package com.assistant.auth;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@DisplayName("AuthController - /api/auth")
class AuthControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private UserRepository userRepository;

    @Test
    @DisplayName("GET /profile returns the stored user for the session's email")
    void profile() throws Exception {
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(
                new User(7L, "owner@example.com", "Owner", "https://pic/1", LocalDateTime.of(2026, 1, 1, 0, 0), null)));

        mockMvc.perform(get("/api/auth/profile").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.email").value("owner@example.com"))
                .andExpect(jsonPath("$.name").value("Owner"))
                .andExpect(jsonPath("$.picture").value("https://pic/1"));
    }

    @Test
    @DisplayName("GET /profile is reachable anonymously and answers 401 itself")
    void profileAnonymous() throws Exception {
        mockMvc.perform(get("/api/auth/profile")).andExpect(status().isUnauthorized());
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("GET /profile answers 404 when the session user has no row")
    void profileUnknownUser() throws Exception {
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/auth/profile").with(user())).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /google/start redirects anonymous users to Spring's Google authorization endpoint")
    void startGoogleLogin() throws Exception {
        mockMvc.perform(get("/api/auth/google/start"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl("/oauth2/authorization/google"));
    }
}
