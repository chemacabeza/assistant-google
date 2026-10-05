package com.assistant.templates;

import com.assistant.auth.User;
import com.assistant.testsupport.StubExchangeFunction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.oauth2.client.AuthorizedClientServiceOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ScheduledEmailDispatcher - sending due templates")
class ScheduledEmailDispatcherTest {

    @Mock
    private CustomAnswerTemplateRepository templateRepository;

    @Mock
    private AuthorizedClientServiceOAuth2AuthorizedClientManager clientManager;

    private StubExchangeFunction http;
    private ScheduledEmailDispatcher dispatcher;

    private static final ClientRegistration GOOGLE = ClientRegistration.withRegistrationId("google")
            .clientId("id").clientSecret("secret")
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("http://localhost/callback")
            .authorizationUri("https://accounts.example/auth")
            .tokenUri("https://accounts.example/token")
            .build();

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        dispatcher = new ScheduledEmailDispatcher(templateRepository, clientManager, http.webClientBuilder());
    }

    private CustomAnswerTemplate dueTask(long id) {
        User user = new User(1L, "owner@example.com", "Owner", null, null, null);
        CustomAnswerTemplate task = new CustomAnswerTemplate(id, user, "Reminder", "Don't forget", "work", null, null);
        task.setFromEmail("owner@example.com");
        task.setTargetEmail("friend@example.com");
        task.setSendAt(LocalDateTime.now().minusMinutes(1));
        return task;
    }

    private OAuth2AuthorizedClient clientWithToken(String token) {
        OAuth2AccessToken accessToken = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, token,
                Instant.now(), Instant.now().plus(Duration.ofHours(1)));
        return new OAuth2AuthorizedClient(GOOGLE, "owner@example.com", accessToken);
    }

    @Test
    @DisplayName("Queries only PENDING tasks that are due now")
    void queriesPendingDueTasks() {
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of());
        LocalDateTime before = LocalDateTime.now();

        dispatcher.dispatchScheduledEmails();

        ArgumentCaptor<LocalDateTime> now = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(templateRepository).findPendingScheduledEmails(eq("PENDING"), now.capture());
        assertThat(now.getValue()).isAfterOrEqualTo(before).isBeforeOrEqualTo(LocalDateTime.now());
        assertThat(http.requests()).isEmpty();
    }

    @Test
    @DisplayName("Sends the email with the owner's token and marks the task SENT")
    void sendsAndMarksSent() {
        CustomAnswerTemplate task = dueTask(7L);
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of(task));
        when(clientManager.authorize(any())).thenReturn(clientWithToken("ya29.token"));
        http.enqueueJson("{\"id\":\"msg-1\"}");

        dispatcher.dispatchScheduledEmails();

        ArgumentCaptor<OAuth2AuthorizeRequest> authorize = ArgumentCaptor.forClass(OAuth2AuthorizeRequest.class);
        verify(clientManager).authorize(authorize.capture());
        assertThat(authorize.getValue().getClientRegistrationId()).isEqualTo("google");
        assertThat(authorize.getValue().getPrincipal()).isInstanceOf(AnonymousAuthenticationToken.class);
        assertThat(authorize.getValue().getPrincipal().getName()).isEqualTo("owner@example.com");

        var request = http.lastRequest();
        assertThat(request.uri().toString()).isEqualTo("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        assertThat(request.headers().getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer ya29.token");
        String raw = request.body().replaceAll("^\\{\"raw\":\"(.*)\"}$", "$1");
        String mime = new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);
        assertThat(mime).contains("From: owner@example.com").contains("To: friend@example.com").contains("Subject: Reminder");

        assertThat(task.getStatus()).isEqualTo("SENT");
        verify(templateRepository).save(task);
    }

    @Test
    @DisplayName("Marks the task FAILED without sending when no token can be obtained")
    void noTokenMarksFailed() {
        CustomAnswerTemplate task = dueTask(8L);
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of(task));
        when(clientManager.authorize(any())).thenReturn(null);

        dispatcher.dispatchScheduledEmails();

        assertThat(http.requests()).isEmpty();
        assertThat(task.getStatus()).isEqualTo("FAILED");
        verify(templateRepository).save(task);
    }

    @Test
    @DisplayName("Marks the task FAILED when Gmail rejects the send, and continues with the next task")
    void gmailErrorMarksFailedAndContinues() {
        CustomAnswerTemplate failing = dueTask(1L);
        CustomAnswerTemplate succeeding = dueTask(2L);
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of(failing, succeeding));
        when(clientManager.authorize(any())).thenReturn(clientWithToken("t"));
        http.enqueue(HttpStatus.BAD_REQUEST, "{\"error\":\"invalid\"}").enqueueJson("{}");

        dispatcher.dispatchScheduledEmails();

        assertThat(failing.getStatus()).isEqualTo("FAILED");
        assertThat(succeeding.getStatus()).isEqualTo("SENT");
        assertThat(http.requests()).hasSize(2);
    }

    @Test
    @DisplayName("Marks the task FAILED when authorization itself throws (e.g. revoked refresh token)")
    void authorizationErrorMarksFailed() {
        CustomAnswerTemplate task = dueTask(3L);
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of(task));
        when(clientManager.authorize(any())).thenThrow(new IllegalStateException("invalid_grant"));

        dispatcher.dispatchScheduledEmails();

        assertThat(task.getStatus()).isEqualTo("FAILED");
        verify(templateRepository).save(task);
        assertThat(http.requests()).isEmpty();
    }

    @Test
    @DisplayName("Does not save anything when there are no due tasks")
    void nothingDue() {
        when(templateRepository.findPendingScheduledEmails(eq("PENDING"), any())).thenReturn(List.of());

        dispatcher.dispatchScheduledEmails();

        verify(templateRepository, never()).save(any());
        verify(clientManager, never()).authorize(any());
    }
}
