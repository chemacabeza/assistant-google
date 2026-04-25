package com.assistant.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LinkedAccountRepository extends JpaRepository<LinkedAccount, Long> {
    boolean existsByEmail(String email);
}
