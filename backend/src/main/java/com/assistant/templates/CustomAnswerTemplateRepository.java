package com.assistant.templates;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CustomAnswerTemplateRepository extends JpaRepository<CustomAnswerTemplate, Long> {
    List<CustomAnswerTemplate> findByUserEmailOrderByCreatedAtDesc(String email);
    List<CustomAnswerTemplate> findByUserEmailAndCategory(String email, String category);
    
    @Query("SELECT t FROM CustomAnswerTemplate t WHERE t.status = :status AND t.sendAt <= :now")
    List<CustomAnswerTemplate> findPendingScheduledEmails(@Param("status") String status, @Param("now") LocalDateTime now);
}
