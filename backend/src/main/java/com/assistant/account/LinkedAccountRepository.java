package com.assistant.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface LinkedAccountRepository extends JpaRepository<LinkedAccount, Long> {
    boolean existsByOwnerEmailAndEmail(String ownerEmail, String email);

    List<LinkedAccount> findByOwnerEmailOrderByIdAsc(String ownerEmail);

    Optional<LinkedAccount> findByIdAndOwnerEmail(Long id, String ownerEmail);

    /** Rows created before accounts had an owner were shared by everyone; give them to {@code ownerEmail}. */
    @Modifying
    @Transactional
    @Query("update LinkedAccount a set a.ownerEmail = :ownerEmail where a.ownerEmail is null")
    int claimUnowned(@Param("ownerEmail") String ownerEmail);
}
