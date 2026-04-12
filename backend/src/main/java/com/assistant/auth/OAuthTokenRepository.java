package com.assistant.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OAuthTokenRepository extends JpaRepository<OAuthToken, Long> {
    Optional<OAuthToken> findByUserEmail(String email);
    Optional<OAuthToken> findByUserId(Long userId);
    void deleteByUserEmail(String email);
}
