package com.assistant.account;

import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.List;

@Service
public class LinkedAccountService {

    private final LinkedAccountRepository repository;

    public LinkedAccountService(LinkedAccountRepository repository) {
        this.repository = repository;
    }

    @PostConstruct
    public void seedInitialAccounts() {
        if (repository.count() == 0) {
            repository.save(new LinkedAccount("chema@chemacabeza.dev", "Primary Account"));
            repository.save(new LinkedAccount("the.engineering.corner.314@gmail.com", "Engineering Corner"));
            repository.save(new LinkedAccount("raymondreddington600@gmail.com", "Alt Account"));
            repository.save(new LinkedAccount("chemacabeza@gmail.com", "Personal Account"));
        }
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
