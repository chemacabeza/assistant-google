package com.assistant.audit;

import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuditLoggingAspect - audit trail for @Auditable methods")
class AuditLoggingAspectTest {

    /** Stand-in for a service with audited and non-audited methods. */
    static class SampleService {
        @Auditable(actionType = "SEND_EMAIL")
        public String send() { return "ok"; }

        @Auditable(actionType = "SEND_EMAIL")
        public String fail() { throw new IllegalStateException("upstream down"); }

        public String read() { return "data"; }
    }

    @Mock private AuditLogRepository auditLogRepository;
    @Mock private UserRepository userRepository;

    private SampleService proxy;
    private final User user = new User(1L, "owner@example.com", "Owner", null, null, null);

    @BeforeEach
    void setUp() {
        // Weave the real aspect around a target, exactly as Spring AOP does at runtime.
        AspectJProxyFactory factory = new AspectJProxyFactory(new SampleService());
        factory.setProxyTargetClass(true);
        factory.addAspect(new AuditLoggingAspect(auditLogRepository, userRepository));
        proxy = factory.getProxy();
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private void signIn(String email) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(email, null, java.util.List.of()));
    }

    @Test
    @DisplayName("Records the action type, user and method name after a successful call")
    void recordsSuccessfulCall() {
        signIn("owner@example.com");
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));

        assertThat(proxy.send()).isEqualTo("ok");

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getUser()).isSameAs(user);
        assertThat(captor.getValue().getActionType()).isEqualTo("SEND_EMAIL");
        assertThat(captor.getValue().getDetails()).isEqualTo("Executed send");
    }

    @Test
    @DisplayName("Does not audit methods without @Auditable")
    void ignoresUnannotatedMethods() {
        signIn("owner@example.com");

        assertThat(proxy.read()).isEqualTo("data");

        verifyNoInteractions(auditLogRepository, userRepository);
    }

    @Test
    @DisplayName("Does not audit a call that threw")
    void ignoresFailedCalls() {
        signIn("owner@example.com");

        assertThatThrownBy(() -> proxy.fail()).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(auditLogRepository);
    }

    @Test
    @DisplayName("Skips auditing when nobody is authenticated (e.g. scheduled jobs)")
    void skipsWithoutAuthentication() {
        assertThat(proxy.send()).isEqualTo("ok");

        verifyNoInteractions(auditLogRepository, userRepository);
    }

    @Test
    @DisplayName("Skips auditing for an unauthenticated token")
    void skipsUnauthenticatedToken() {
        TestingAuthenticationToken token = new TestingAuthenticationToken("owner@example.com", null);
        token.setAuthenticated(false);
        SecurityContextHolder.getContext().setAuthentication(token);

        proxy.send();

        verifyNoInteractions(auditLogRepository, userRepository);
    }

    @Test
    @DisplayName("Skips auditing when the principal has no user row")
    void skipsUnknownUser() {
        signIn("ghost@example.com");
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        proxy.send();

        verify(auditLogRepository, never()).save(any());
    }

    @Test
    @DisplayName("A failing audit write never breaks the audited operation")
    void auditFailureIsSwallowed() {
        signIn("owner@example.com");
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));
        when(auditLogRepository.save(any())).thenThrow(new IllegalStateException("db down"));

        assertThat(proxy.send()).isEqualTo("ok");
    }
}
