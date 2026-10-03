package com.assistant.account;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LinkedAccountService {

    private final LinkedAccountRepository repository;

    public LinkedAccountService(LinkedAccountRepository repository) {
        this.repository = repository;
    }

    /**
     * Registers the signed-in Google account as a linked account the first time it is seen,
     * so the "From" selectors have a sensible default without any hard-coded addresses.
     */
    public void ensureLinked(String email, String name) {
        if (email == null || email.isBlank() || repository.existsByEmail(email)) {
            return;
        }
        repository.save(new LinkedAccount(email, name != null && !name.isBlank() ? name : email));
    }

    public List<LinkedAccount> getAllAccounts() {
        return repository.findAll();
    }

    public LinkedAccount addAccount(LinkedAccount account) {
        if (repository.existsByEmail(account.getEmail())) {
            throw new IllegalArgumentException("Account with this email already exists");
        }
        return repository.save(account);
    }

    public void deleteAccount(Long id) {
        repository.deleteById(id);
    }
}
