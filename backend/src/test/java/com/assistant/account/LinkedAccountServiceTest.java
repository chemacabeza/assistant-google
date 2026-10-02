package com.assistant.account;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("LinkedAccountService - Account Management Tests")
class LinkedAccountServiceTest {

    @Mock
    private LinkedAccountRepository linkedAccountRepository;

    @InjectMocks
    private LinkedAccountService linkedAccountService;

    private LinkedAccount testAccount1;
    private LinkedAccount testAccount2;

    @BeforeEach
    void setUp() {
        testAccount1 = new LinkedAccount("test1@example.com", "Test Account 1");
        testAccount1.setId(1L);

        testAccount2 = new LinkedAccount("test2@example.com", "Test Account 2");
        testAccount2.setId(2L);
    }

    @Test
    @DisplayName("Should retrieve all accounts successfully")
    void testGetAllAccounts() {
        // Arrange
        List<LinkedAccount> expectedAccounts = Arrays.asList(testAccount1, testAccount2);
        when(linkedAccountRepository.findAll()).thenReturn(expectedAccounts);

        // Act
        List<LinkedAccount> result = linkedAccountService.getAllAccounts();

        // Assert
        assertNotNull(result);
        assertEquals(2, result.size());
        assertEquals("test1@example.com", result.get(0).getEmail());
        assertEquals("test2@example.com", result.get(1).getEmail());
        verify(linkedAccountRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("Should return empty list when no accounts exist")
    void testGetAllAccountsEmpty() {
        // Arrange
        when(linkedAccountRepository.findAll()).thenReturn(Collections.emptyList());

        // Act
        List<LinkedAccount> result = linkedAccountService.getAllAccounts();

        // Assert
        assertNotNull(result);
        assertTrue(result.isEmpty());
        verify(linkedAccountRepository, times(1)).findAll();
    }

    @Test
    @DisplayName("Should add a new account successfully")
    void testAddAccountSuccess() {
        // Arrange
        when(linkedAccountRepository.existsByEmail("newaccount@example.com")).thenReturn(false);
        when(linkedAccountRepository.save(any(LinkedAccount.class))).thenReturn(testAccount1);

        LinkedAccount newAccount = new LinkedAccount("newaccount@example.com", "New Account");

        // Act
        LinkedAccount result = linkedAccountService.addAccount(newAccount);

        // Assert
        assertNotNull(result);
        assertEquals("test1@example.com", result.getEmail());
        verify(linkedAccountRepository, times(1)).existsByEmail("newaccount@example.com");
        verify(linkedAccountRepository, times(1)).save(any(LinkedAccount.class));
    }

    @Test
    @DisplayName("Should throw exception when adding duplicate account")
    void testAddAccountDuplicate() {
        // Arrange
        when(linkedAccountRepository.existsByEmail("duplicate@example.com")).thenReturn(true);

        LinkedAccount duplicateAccount = new LinkedAccount("duplicate@example.com", "Duplicate");

        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> {
            linkedAccountService.addAccount(duplicateAccount);
        });

        verify(linkedAccountRepository, times(1)).existsByEmail("duplicate@example.com");
        verify(linkedAccountRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should delete account by ID")
    void testDeleteAccountSuccess() {
        // Arrange
        Long accountId = 1L;

        // Act
        linkedAccountService.deleteAccount(accountId);

        // Assert
        verify(linkedAccountRepository, times(1)).deleteById(1L);
    }

    @Test
    @DisplayName("Should save account with null ID")
    void testAddAccountWithNullId() {
        // Arrange
        LinkedAccount newAccount = new LinkedAccount("email@example.com", "Account");
        newAccount.setId(null); // Explicitly set null ID

        when(linkedAccountRepository.existsByEmail("email@example.com")).thenReturn(false);
        when(linkedAccountRepository.save(any(LinkedAccount.class))).thenReturn(newAccount);

        // Act
        LinkedAccount result = linkedAccountService.addAccount(newAccount);

        // Assert
        assertNotNull(result);
        assertNull(result.getId());
        verify(linkedAccountRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("Should handle multiple calls to add accounts")
    void testAddMultipleAccounts() {
        // Arrange
        when(linkedAccountRepository.existsByEmail(anyString())).thenReturn(false);
        when(linkedAccountRepository.save(any(LinkedAccount.class)))
            .thenReturn(testAccount1)
            .thenReturn(testAccount2);

        LinkedAccount acc1 = new LinkedAccount("test1@example.com", "Account 1");
        LinkedAccount acc2 = new LinkedAccount("test2@example.com", "Account 2");

        // Act
        linkedAccountService.addAccount(acc1);
        linkedAccountService.addAccount(acc2);

        // Assert
        verify(linkedAccountRepository, times(2)).existsByEmail(anyString());
        verify(linkedAccountRepository, times(2)).save(any());
    }

    @Test
    @DisplayName("Should pass correct email to existsByEmail check")
    void testAddAccountChecksCorrectEmail() {
        // Arrange
        String emailToAdd = "specific@example.com";
        when(linkedAccountRepository.existsByEmail(emailToAdd)).thenReturn(false);
        when(linkedAccountRepository.save(any(LinkedAccount.class))).thenReturn(testAccount1);

        LinkedAccount newAccount = new LinkedAccount(emailToAdd, "Test");

        // Act
        linkedAccountService.addAccount(newAccount);

        // Assert
        verify(linkedAccountRepository, times(1)).existsByEmail(emailToAdd);
    }

    @Test
    @DisplayName("Should delete account with specific ID")
    void testDeleteAccountWithSpecificId() {
        // Arrange
        Long specificId = 42L;

        // Act
        linkedAccountService.deleteAccount(specificId);

        // Assert
        verify(linkedAccountRepository, times(1)).deleteById(42L);
    }
}
