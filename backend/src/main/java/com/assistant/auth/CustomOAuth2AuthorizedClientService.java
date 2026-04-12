package com.assistant.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Optional;

@Service
public class CustomOAuth2AuthorizedClientService implements OAuth2AuthorizedClientService {

    private final OAuthTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final ClientRegistrationRepository clientRegistrationRepository;

    @Override
    @Transactional(readOnly = true)
    public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId, String principalName) {
        Optional<OAuthToken> tokenOpt = tokenRepository.findByUserEmail(principalName);
        if (tokenOpt.isEmpty()) {
            return null;
        }
        
        OAuthToken tokenEntity = tokenOpt.get();
        ClientRegistration clientRegistration = clientRegistrationRepository.findByRegistrationId(clientRegistrationId);
        
        if (clientRegistration == null) {
            return null;
        }

        OAuth2AccessToken accessToken = new OAuth2AccessToken(
                OAuth2AccessToken.TokenType.BEARER,
                tokenEntity.getAccessToken(),
                null, // Issued at (not crucial for simple load)
                tokenEntity.getExpiresAt(),
                new HashSet<>(Arrays.asList(tokenEntity.getScope().split(",")))
        );

        OAuth2RefreshToken refreshToken = null;
        if (tokenEntity.getRefreshToken() != null) {
            refreshToken = new OAuth2RefreshToken(tokenEntity.getRefreshToken(), null);
        }

        return (T) new OAuth2AuthorizedClient(clientRegistration, principalName, accessToken, refreshToken);
    }

    @Override
    @Transactional
    public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal) {
        String email = principal.getName();
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return;
        }

        OAuth2AccessToken accessToken = authorizedClient.getAccessToken();
        OAuth2RefreshToken refreshToken = authorizedClient.getRefreshToken();
        
        OAuthToken token = tokenRepository.findByUserEmail(email).orElse(new OAuthToken());
        token.setUser(user);
        token.setAccessToken(accessToken.getTokenValue());
        
        if (refreshToken != null) {
            token.setRefreshToken(refreshToken.getTokenValue());
        }
        
        if (accessToken.getExpiresAt() != null) {
            token.setExpiresAt(accessToken.getExpiresAt());
        }
        
        if (accessToken.getScopes() != null) {
            token.setScope(String.join(",", accessToken.getScopes()));
        }

        tokenRepository.save(token);
    }

    @Override
    @Transactional
    public void removeAuthorizedClient(String clientRegistrationId, String principalName) {
        tokenRepository.deleteByUserEmail(principalName);
    }

    public CustomOAuth2AuthorizedClientService(OAuthTokenRepository tokenRepository, UserRepository userRepository, ClientRegistrationRepository clientRegistrationRepository) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.clientRegistrationRepository = clientRegistrationRepository;
    }
}
