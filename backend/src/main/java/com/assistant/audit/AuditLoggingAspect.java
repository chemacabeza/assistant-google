package com.assistant.audit;

import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Optional;

@Aspect
@Component
public class AuditLoggingAspect {

    private static final Logger log = LoggerFactory.getLogger(AuditLoggingAspect.class);

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

    public AuditLoggingAspect(AuditLogRepository auditLogRepository, UserRepository userRepository) {
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
    }

    @AfterReturning(pointcut = "@annotation(auditable)", returning = "result")
    public void logAudit(JoinPoint joinPoint, Auditable auditable, Object result) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication == null || !authentication.isAuthenticated()) {
                return;
            }

            String email = authentication.getName();
            Optional<User> userOpt = userRepository.findByEmail(email);

            if (userOpt.isPresent()) {
                AuditLog logEntry = new AuditLog();
                logEntry.setUser(userOpt.get());
                logEntry.setActionType(auditable.actionType());
                logEntry.setDetails("Executed " + joinPoint.getSignature().getName());
                auditLogRepository.save(logEntry);
            }
        } catch (Exception e) {
            // Auditing must never break the audited operation.
            log.warn("Failed to save audit log for action {}: {}", auditable.actionType(), e.toString());
        }
    }
}
