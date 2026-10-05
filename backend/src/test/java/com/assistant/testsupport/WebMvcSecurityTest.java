package com.assistant.testsupport;

import com.assistant.auth.CustomOAuth2AuthorizedClientService;
import com.assistant.auth.CustomOAuth2UserService;
import com.assistant.auth.CustomOidcUserService;
import com.assistant.config.SecurityConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.Map;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;

/**
 * Base for {@code @WebMvcTest} slices that run requests through the application's real
 * {@link SecurityConfig} (401 entry point, cookie CSRF, CSRF/auth exemptions for the
 * WhatsApp bridge and Meta webhook). The OAuth2 login collaborators are mocked; tests
 * authenticate with {@link #user(String)}.
 */
@Import(SecurityConfig.class)
@ActiveProfiles("test")
public abstract class WebMvcSecurityTest {

    @Autowired
    protected MockMvc mockMvc;

    @MockitoBean
    protected CustomOAuth2UserService customOAuth2UserService;

    @MockitoBean
    protected CustomOidcUserService customOidcUserService;

    @MockitoBean
    protected CustomOAuth2AuthorizedClientService customOAuth2AuthorizedClientService;

    /**
     * An OAuth2-logged-in Google user. As in production ({@code user-name-attribute: email}),
     * the principal's name is its email address.
     */
    public static RequestPostProcessor user(String email) {
        return oauth2Login().oauth2User(new DefaultOAuth2User(
                AuthorityUtils.createAuthorityList("OAUTH2_USER"),
                Map.of("sub", "google-" + email, "email", email),
                "email"));
    }

    public static RequestPostProcessor user() {
        return user("owner@example.com");
    }
}
