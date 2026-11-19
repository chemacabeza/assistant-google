package com.assistant.account;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("LinkedAccountService - per-user linked accounts")
class LinkedAccountServiceTest {

    private static final String OWNER = "owner@example.com";

    @Mock
    private LinkedAccountRepository repository;

    @InjectMocks
    private LinkedAccountService service;

    private static LinkedAccount account(Long id, String email, String owner) {
        LinkedAccount a = new LinkedAccount(email, email);
        a.setId(id);
        a.setOwnerEmail(owner);
        return a;
    }

    @Test
    @DisplayName("getAccounts adopts legacy unowned rows, then lists only the owner's accounts")
    void getAccounts() {
        List<LinkedAccount> mine = List.of(account(1L, "a@example.com", OWNER));
        when(repository.findByOwnerEmailOrderByIdAsc(OWNER)).thenReturn(mine);

        assertThat(service.getAccounts(OWNER)).isEqualTo(mine);
        verify(repository).claimUnowned(OWNER);
    }

    @Test
    @DisplayName("addAccount stamps the owner and ignores any client-supplied id")
    void addAccount() {
        when(repository.existsByOwnerEmailAndEmail(OWNER, "new@example.com")).thenReturn(false);
        when(repository.save(any(LinkedAccount.class))).thenAnswer(inv -> inv.getArgument(0));

        LinkedAccount saved = service.addAccount(OWNER, account(99L, "new@example.com", "someone-else@example.com"));

        assertThat(saved.getId()).isNull();
        assertThat(saved.getOwnerEmail()).isEqualTo(OWNER);
        assertThat(saved.getEmail()).isEqualTo("new@example.com");
    }

    @Test
    @DisplayName("addAccount rejects an address the owner already linked")
    void addDuplicate() {
        when(repository.existsByOwnerEmailAndEmail(OWNER, "dup@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.addAccount(OWNER, new LinkedAccount("dup@example.com", "Dup")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Account with this email already exists");
        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("deleteAccount removes only the owner's own account")
    void deleteOwn() {
        LinkedAccount mine = account(4L, "a@example.com", OWNER);
        when(repository.findByIdAndOwnerEmail(4L, OWNER)).thenReturn(Optional.of(mine));

        assertThat(service.deleteAccount(OWNER, 4L)).isTrue();
        verify(repository).delete(mine);
    }

    @Test
    @DisplayName("deleteAccount leaves other users' accounts alone")
    void deleteForeign() {
        when(repository.findByIdAndOwnerEmail(5L, OWNER)).thenReturn(Optional.empty());

        assertThat(service.deleteAccount(OWNER, 5L)).isFalse();
        verify(repository, never()).delete(any());
        verify(repository, never()).deleteById(any());
    }

    @Test
    @DisplayName("ensureLinked links the signed-in address to itself once")
    void ensureLinked() {
        when(repository.existsByOwnerEmailAndEmail("new@example.com", "new@example.com")).thenReturn(false);

        service.ensureLinked("new@example.com", " ");

        ArgumentCaptor<LinkedAccount> captor = ArgumentCaptor.forClass(LinkedAccount.class);
        verify(repository).claimUnowned("new@example.com");
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("new@example.com");
        assertThat(captor.getValue().getName()).isEqualTo("new@example.com");
        assertThat(captor.getValue().getOwnerEmail()).isEqualTo("new@example.com");
    }

    @Test
    @DisplayName("ensureLinked does nothing for an already linked or blank address")
    void ensureLinkedNoop() {
        when(repository.existsByOwnerEmailAndEmail(OWNER, OWNER)).thenReturn(true);
        service.ensureLinked(OWNER, "Owner");
        verify(repository, never()).save(any());

        LinkedAccountRepository untouched = org.mockito.Mockito.mock(LinkedAccountRepository.class);
        new LinkedAccountService(untouched).ensureLinked(" ", "x");
        verifyNoInteractions(untouched);
    }
}
