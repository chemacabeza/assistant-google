package com.assistant.auth;

import com.assistant.account.LinkedAccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import java.time.Instant;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomOidcUserService - user provisioning on OIDC login")
class CustomOidcUserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private LinkedAccountService linkedAccountService;

    private CustomOidcUserService service;

    @BeforeEach
    void setUp() {
        service = new CustomOidcUserService(userRepository, linkedAccountService);
    }

    /** No user-info URI, so OidcUserService builds the principal from the ID token without any HTTP call. */
    private OidcUserRequest request(Consumer<OidcIdToken.Builder> claims) {
        ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId("id").clientSecret("secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost/login/oauth2/code/google")
                .authorizationUri("https://accounts.test/auth")
                .tokenUri("https://accounts.test/token")
                .jwkSetUri("https://accounts.test/jwks")
                .userNameAttributeName("email")
                .scope("openid", "profile", "email")
                .build();
        OAuth2AccessToken accessToken = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "access",
                Instant.now(), Instant.now().plusSeconds(3600));
        OidcIdToken.Builder idToken = OidcIdToken.withTokenValue("id-token")
                .subject("google-sub-1")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600));
        claims.accept(idToken);
        return new OidcUserRequest(registration, accessToken, idToken.build());
    }

    @Test
    @DisplayName("Creates and links a first-time user from the ID token claims")
    void createsNewUser() {
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());

        OidcUser user = service.loadUser(request(t -> t
                .claim("email", "new@example.com").claim("name", "New Person").claim("picture", "https://pic/1")));

        assertThat(user.getName()).isEqualTo("new@example.com");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("new@example.com");
        assertThat(saved.getValue().getName()).isEqualTo("New Person");
        assertThat(saved.getValue().getPicture()).isEqualTo("https://pic/1");
        verify(linkedAccountService).ensureLinked("new@example.com", "New Person");
    }

    @Test
    @DisplayName("Falls back to the email as name for a new user without a name claim")
    void newUserWithoutName() {
        when(userRepository.findByEmail("anon@example.com")).thenReturn(Optional.empty());

        service.loadUser(request(t -> t.claim("email", "anon@example.com")));

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getName()).isEqualTo("anon@example.com");
    }

    @Test
    @DisplayName("Refreshes name and picture of an existing user")
    void updatesExistingUser() {
        User existing = new User(1L, "old@example.com", "Original", null, null, null);
        when(userRepository.findByEmail("old@example.com")).thenReturn(Optional.of(existing));

        service.loadUser(request(t -> t.claim("email", "old@example.com").claim("name", "Renamed").claim("picture", "https://pic/2")));

        verify(userRepository).save(existing);
        assertThat(existing.getName()).isEqualTo("Renamed");
        assertThat(existing.getPicture()).isEqualTo("https://pic/2");
        verifyNoInteractions(linkedAccountService);
    }

    @Test
    @DisplayName("Leaves an unchanged existing user untouched")
    void unchangedUser() {
        when(userRepository.findByEmail("same@example.com"))
                .thenReturn(Optional.of(new User(1L, "same@example.com", "Same", "https://pic/s", null, null)));

        service.loadUser(request(t -> t.claim("email", "same@example.com").claim("name", "Same").claim("picture", "https://pic/s")));

        verify(userRepository, never()).save(any());
    }
}
