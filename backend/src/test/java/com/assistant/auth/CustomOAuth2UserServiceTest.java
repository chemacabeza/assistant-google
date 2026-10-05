package com.assistant.auth;

import com.assistant.account.LinkedAccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@ExtendWith(MockitoExtension.class)
@DisplayName("CustomOAuth2UserService - user provisioning on OAuth2 login")
class CustomOAuth2UserServiceTest {

    private static final String USER_INFO_URI = "https://userinfo.test/v1/me";

    @Mock
    private UserRepository userRepository;

    @Mock
    private LinkedAccountService linkedAccountService;

    private CustomOAuth2UserService service;
    private MockRestServiceServer userInfoServer;

    @BeforeEach
    void setUp() {
        service = new CustomOAuth2UserService(userRepository, linkedAccountService);
        RestTemplate restTemplate = new RestTemplate();
        userInfoServer = MockRestServiceServer.bindTo(restTemplate).build();
        service.setRestOperations(restTemplate);
    }

    private OAuth2UserRequest request() {
        ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId("id").clientSecret("secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost/login/oauth2/code/google")
                .authorizationUri("https://accounts.test/auth")
                .tokenUri("https://accounts.test/token")
                .userInfoUri(USER_INFO_URI)
                .userNameAttributeName("email")
                .build();
        OAuth2AccessToken token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "access-token",
                Instant.now(), Instant.now().plusSeconds(3600));
        return new OAuth2UserRequest(registration, token);
    }

    private void userInfoReturns(String json) {
        userInfoServer.expect(requestTo(USER_INFO_URI))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer access-token"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    @Test
    @DisplayName("Creates the user and links the account on first login")
    void createsNewUser() {
        userInfoReturns("{\"email\":\"new@example.com\",\"name\":\"New Person\",\"picture\":\"https://pic/1\"}");
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());

        OAuth2User principal = service.loadUser(request());

        assertThat(principal.getName()).isEqualTo("new@example.com");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("new@example.com");
        assertThat(saved.getValue().getName()).isEqualTo("New Person");
        assertThat(saved.getValue().getPicture()).isEqualTo("https://pic/1");
        verify(linkedAccountService).ensureLinked("new@example.com", "New Person");
        userInfoServer.verify();
    }

    @Test
    @DisplayName("Uses the email as display name when the provider sends no name")
    void newUserWithoutName() {
        userInfoReturns("{\"email\":\"anon@example.com\"}");
        when(userRepository.findByEmail("anon@example.com")).thenReturn(Optional.empty());

        service.loadUser(request());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getName()).isEqualTo("anon@example.com");
        verify(linkedAccountService).ensureLinked("anon@example.com", null);
    }

    @Test
    @DisplayName("Updates name and picture of an existing user when they changed")
    void updatesChangedProfile() {
        userInfoReturns("{\"email\":\"old@example.com\",\"name\":\"Renamed\",\"picture\":\"https://pic/new\"}");
        User existing = new User(1L, "old@example.com", "Original", "https://pic/old", null, null);
        when(userRepository.findByEmail("old@example.com")).thenReturn(Optional.of(existing));

        service.loadUser(request());

        verify(userRepository).save(existing);
        assertThat(existing.getName()).isEqualTo("Renamed");
        assertThat(existing.getPicture()).isEqualTo("https://pic/new");
        verifyNoInteractions(linkedAccountService);
    }

    @Test
    @DisplayName("Does not write an unchanged existing user")
    void unchangedProfileNotSaved() {
        userInfoReturns("{\"email\":\"same@example.com\",\"name\":\"Same\",\"picture\":\"https://pic/same\"}");
        when(userRepository.findByEmail("same@example.com"))
                .thenReturn(Optional.of(new User(1L, "same@example.com", "Same", "https://pic/same", null, null)));

        service.loadUser(request());

        verify(userRepository, never()).save(any());
        verify(linkedAccountService, never()).ensureLinked(anyString(), any());
    }
}
