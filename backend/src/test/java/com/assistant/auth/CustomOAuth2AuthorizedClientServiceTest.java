package com.assistant.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomOAuth2AuthorizedClientService - token persistence")
class CustomOAuth2AuthorizedClientServiceTest {

    @Mock private OAuthTokenRepository tokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ClientRegistrationRepository clientRegistrationRepository;

    @InjectMocks
    private CustomOAuth2AuthorizedClientService service;

    private ClientRegistration google;
    private User user;
    private final Instant expiresAt = Instant.parse("2026-10-05T12:00:00Z");

    @BeforeEach
    void setUp() {
        google = ClientRegistration.withRegistrationId("google")
                .clientId("id").clientSecret("secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost/cb")
                .authorizationUri("https://accounts.test/auth")
                .tokenUri("https://accounts.test/token")
                .build();
        user = new User(1L, "owner@example.com", "Owner", null, null, null);
    }

    // ── load ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("loadAuthorizedClient rebuilds the client from the stored token, scopes and refresh token")
    void loadsStoredClient() {
        when(tokenRepository.findByUserEmail("owner@example.com")).thenReturn(Optional.of(
                new OAuthToken(1L, user, "access-1", "refresh-1", expiresAt, "openid,email")));
        when(clientRegistrationRepository.findByRegistrationId("google")).thenReturn(google);

        OAuth2AuthorizedClient client = service.loadAuthorizedClient("google", "owner@example.com");

        assertThat(client.getClientRegistration()).isSameAs(google);
        assertThat(client.getPrincipalName()).isEqualTo("owner@example.com");
        assertThat(client.getAccessToken().getTokenValue()).isEqualTo("access-1");
        assertThat(client.getAccessToken().getTokenType()).isEqualTo(OAuth2AccessToken.TokenType.BEARER);
        assertThat(client.getAccessToken().getExpiresAt()).isEqualTo(expiresAt);
        assertThat(client.getAccessToken().getScopes()).containsExactlyInAnyOrder("openid", "email");
        assertThat(client.getRefreshToken().getTokenValue()).isEqualTo("refresh-1");
    }

    @Test
    @DisplayName("loadAuthorizedClient tolerates a token without scope or refresh token")
    void loadsMinimalToken() {
        when(tokenRepository.findByUserEmail("owner@example.com")).thenReturn(Optional.of(
                new OAuthToken(1L, user, "access-1", null, expiresAt, null)));
        when(clientRegistrationRepository.findByRegistrationId("google")).thenReturn(google);

        OAuth2AuthorizedClient client = service.loadAuthorizedClient("google", "owner@example.com");

        assertThat(client.getRefreshToken()).isNull();
        assertThat(client.getAccessToken().getScopes()).isEmpty();
    }

    @Test
    @DisplayName("loadAuthorizedClient returns null when nothing is stored")
    void loadReturnsNullWithoutToken() {
        when(tokenRepository.findByUserEmail("nobody@example.com")).thenReturn(Optional.empty());

        assertThat((OAuth2AuthorizedClient) service.loadAuthorizedClient("google", "nobody@example.com")).isNull();
    }

    @Test
    @DisplayName("loadAuthorizedClient returns null for an unknown client registration")
    void loadReturnsNullForUnknownRegistration() {
        when(tokenRepository.findByUserEmail("owner@example.com")).thenReturn(Optional.of(
                new OAuthToken(1L, user, "a", null, expiresAt, null)));
        when(clientRegistrationRepository.findByRegistrationId("github")).thenReturn(null);

        assertThat((OAuth2AuthorizedClient) service.loadAuthorizedClient("github", "owner@example.com")).isNull();
    }

    // ── save ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("saveAuthorizedClient stores a new token row for the user")
    void savesNewToken() {
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));
        when(tokenRepository.findByUserEmail("owner@example.com")).thenReturn(Optional.empty());
        OAuth2AccessToken access = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "access-2",
                expiresAt.minusSeconds(3600), expiresAt, Set.of("openid"));
        OAuth2AuthorizedClient client = new OAuth2AuthorizedClient(google, "owner@example.com", access,
                new OAuth2RefreshToken("refresh-2", null));

        service.saveAuthorizedClient(client, new TestingAuthenticationToken("owner@example.com", null));

        ArgumentCaptor<OAuthToken> saved = ArgumentCaptor.forClass(OAuthToken.class);
        verify(tokenRepository).save(saved.capture());
        assertThat(saved.getValue().getUser()).isSameAs(user);
        assertThat(saved.getValue().getAccessToken()).isEqualTo("access-2");
        assertThat(saved.getValue().getRefreshToken()).isEqualTo("refresh-2");
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(expiresAt);
        assertThat(saved.getValue().getScope()).isEqualTo("openid");
    }

    @Test
    @DisplayName("saveAuthorizedClient keeps the stored refresh token when Google does not send a new one")
    void keepsRefreshTokenOnRefresh() {
        OAuthToken stored = new OAuthToken(5L, user, "old-access", "long-lived-refresh", expiresAt, "openid");
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));
        when(tokenRepository.findByUserEmail("owner@example.com")).thenReturn(Optional.of(stored));
        OAuth2AccessToken access = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "new-access",
                expiresAt, expiresAt.plusSeconds(3600));

        service.saveAuthorizedClient(new OAuth2AuthorizedClient(google, "owner@example.com", access),
                new TestingAuthenticationToken("owner@example.com", null));

        verify(tokenRepository).save(stored);
        assertThat(stored.getId()).isEqualTo(5L);
        assertThat(stored.getAccessToken()).isEqualTo("new-access");
        assertThat(stored.getRefreshToken()).isEqualTo("long-lived-refresh");
        assertThat(stored.getExpiresAt()).isEqualTo(expiresAt.plusSeconds(3600));
    }

    @Test
    @DisplayName("saveAuthorizedClient does nothing for an unknown user")
    void ignoresUnknownUser() {
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());
        OAuth2AccessToken access = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "a", null, null);

        service.saveAuthorizedClient(new OAuth2AuthorizedClient(google, "ghost@example.com", access),
                new TestingAuthenticationToken("ghost@example.com", null));

        verify(tokenRepository, never()).save(any());
    }

    // ── remove ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("removeAuthorizedClient deletes the user's token")
    void removesToken() {
        service.removeAuthorizedClient("google", "owner@example.com");

        verify(tokenRepository).deleteByUserEmail("owner@example.com");
    }
}
