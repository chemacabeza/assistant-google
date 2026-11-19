package com.assistant.account;

import org.springframework.stereotype.Service;

import java.util.List;

/** Linked "send as" addresses. Every account belongs to the signed-in user who added it. */
@Service
public class LinkedAccountService {

    private final LinkedAccountRepository repository;

    public LinkedAccountService(LinkedAccountRepository repository) {
        this.repository = repository;
    }

    /**
     * Registers the signed-in Google account as one of its own linked accounts the first time
     * it is seen, so the "From" selectors have a sensible default without hard-coded addresses.
     */
    public void ensureLinked(String email, String name) {
        if (email == null || email.isBlank()) {
            return;
        }
        repository.claimUnowned(email);
        if (repository.existsByOwnerEmailAndEmail(email, email)) {
            return;
        }
        LinkedAccount account = new LinkedAccount(email, name != null && !name.isBlank() ? name : email);
        account.setOwnerEmail(email);
        repository.save(account);
    }

    public List<LinkedAccount> getAccounts(String ownerEmail) {
        // Accounts saved before ownership existed are adopted by the first user who uses them.
        repository.claimUnowned(ownerEmail);
        return repository.findByOwnerEmailOrderByIdAsc(ownerEmail);
    }

    public LinkedAccount addAccount(String ownerEmail, LinkedAccount account) {
        if (repository.existsByOwnerEmailAndEmail(ownerEmail, account.getEmail())) {
            throw new IllegalArgumentException("Account with this email already exists");
        }
        account.setId(null);
        account.setOwnerEmail(ownerEmail);
        return repository.save(account);
    }

    /** Deletes the account if it belongs to {@code ownerEmail}; other users' accounts are left alone. */
    public boolean deleteAccount(String ownerEmail, Long id) {
        return repository.findByIdAndOwnerEmail(id, ownerEmail)
                .map(account -> {
                    repository.delete(account);
                    return true;
                })
                .orElse(false);
    }
}
