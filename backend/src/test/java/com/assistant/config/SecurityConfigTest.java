package com.assistant.config;

import com.assistant.auth.AuthController;
import com.assistant.auth.UserRepository;
import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cross-cutting rules of {@link SecurityConfig} exercised through the real filter chain. */
@WebMvcTest({AuthController.class, ConfigController.class})
@DisplayName("SecurityConfig - filter chain rules")
class SecurityConfigTest extends WebMvcSecurityTest {

    @MockitoBean
    private UserRepository userRepository;

    @Autowired
    private AuthenticationSuccessHandler successHandler;

    @Test
    @DisplayName("Unknown/protected API paths answer 401 instead of redirecting to a login page")
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/config/env")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/anything")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Writing the .env configuration requires a session and a CSRF token")
    void configWriteIsProtected() throws Exception {
        mockMvc.perform(post("/api/config/env").with(csrf()).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/config/env").with(user()).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Every response issues a readable XSRF-TOKEN cookie for the SPA")
    void csrfCookieIssued() throws Exception {
        mockMvc.perform(get("/api/auth/profile"))
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    @DisplayName("A raw (non-masked) X-XSRF-TOKEN header matching the cookie is accepted")
    void rawCsrfHeaderAccepted() throws Exception {
        var cookie = new jakarta.servlet.http.Cookie("XSRF-TOKEN", "plain-token-123");

        mockMvc.perform(post("/api/auth/logout").with(user()).cookie(cookie).header("X-XSRF-TOKEN", "plain-token-123"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/logout").with(user()).cookie(cookie).header("X-XSRF-TOKEN", "wrong"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /api/auth/logout answers 200 (no redirect) and expires the session cookie")
    void logout() throws Exception {
        mockMvc.perform(post("/api/auth/logout").with(user()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HttpHeaders.LOCATION))
                .andExpect(cookie().maxAge("JSESSIONID", 0));
    }

    @Test
    @DisplayName("CORS preflight from the configured frontend origin is allowed with credentials")
    void corsAllowedOrigin() throws Exception {
        mockMvc.perform(options("/api/templates")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "DELETE"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

    @Test
    @DisplayName("CORS preflight from any other origin is rejected")
    void corsOtherOrigin() throws Exception {
        mockMvc.perform(options("/api/templates")
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    @DisplayName("The OAuth2 authorization endpoint redirects to Google with the configured client id")
    void oauth2AuthorizationRedirect() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().isFound())
                .andExpect(header().string(HttpHeaders.LOCATION, startsWith("https://accounts.google.com/o/oauth2/v2/auth?")))
                .andExpect(header().string(HttpHeaders.LOCATION, org.hamcrest.Matchers.containsString("client_id=test-client-id")));
    }

    @Test
    @DisplayName("After login the user is sent to the frontend dashboard")
    void successHandlerRedirectsToDashboard() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        successHandler.onAuthenticationSuccess(new MockHttpServletRequest(), response, new TestingAuthenticationToken("u", null));

        assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:5173/dashboard");
    }
}
