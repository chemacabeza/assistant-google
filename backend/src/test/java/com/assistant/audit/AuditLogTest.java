package com.assistant.audit;

import com.assistant.auth.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AuditLog - Entity Model Tests")
class AuditLogTest {

    private AuditLog auditLog;
    private User testUser;

    @BeforeEach
    void setUp() {
        auditLog = new AuditLog();
        testUser = new User();
        testUser.setId(1L);
    }

    @Test
    @DisplayName("Should set and get audit log ID")
    void testSetGetId() {
        // Arrange
        Long testId = 123L;

        // Act
        auditLog.setId(testId);

        // Assert
        assertEquals(testId, auditLog.getId());
    }

    @Test
    @DisplayName("Should set and get user")
    void testSetGetUser() {
        // Act
        auditLog.setUser(testUser);

        // Assert
        assertEquals(testUser, auditLog.getUser());
        assertEquals(1L, auditLog.getUser().getId());
    }

    @Test
    @DisplayName("Should set and get action type")
    void testSetGetActionType() {
        // Arrange
        String actionType = "CREATE_EVENT";

        // Act
        auditLog.setActionType(actionType);

        // Assert
        assertEquals(actionType, auditLog.getActionType());
    }

    @Test
    @DisplayName("Should set and get details")
    void testSetGetDetails() {
        // Arrange
        String details = "User created a new event with ID: 12345";

        // Act
        auditLog.setDetails(details);

        // Assert
        assertEquals(details, auditLog.getDetails());
    }

    @Test
    @DisplayName("Should handle null details")
    void testSetGetDetailsNull() {
        // Act
        auditLog.setDetails(null);

        // Assert
        assertNull(auditLog.getDetails());
    }

    @Test
    @DisplayName("Should handle various action types")
    void testVariousActionTypes() {
        // Arrange
        String[] actionTypes = {
            "CREATE_EVENT",
            "UPDATE_EVENT",
            "DELETE_EVENT",
            "VIEW_EMAIL",
            "SEND_EMAIL"
        };

        // Act & Assert
        for (String actionType : actionTypes) {
            auditLog.setActionType(actionType);
            assertEquals(actionType, auditLog.getActionType());
        }
    }

    @Test
    @DisplayName("Should handle large details string")
    void testLargeDetailsString() {
        // Arrange
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 1000; i++) {
            sb.append("This is a large details string. ");
        }
        String largeDetails = sb.toString();

        // Act
        auditLog.setDetails(largeDetails);

        // Assert
        assertEquals(largeDetails, auditLog.getDetails());
    }

    @Test
    @DisplayName("Should set and get timestamp")
    void testSetGetTimestamp() {
        // Arrange
        LocalDateTime now = LocalDateTime.now();

        // Act
        // Note: timestamp is set by @CreationTimestamp annotation, 
        // but we can test manual setting for completeness
        auditLog.setTimestamp(now);

        // Assert
        assertEquals(now, auditLog.getTimestamp());
    }

    @Test
    @DisplayName("Should handle null user")
    void testSetGetUserNull() {
        // Act
        auditLog.setUser(null);

        // Assert
        assertNull(auditLog.getUser());
    }

    @Test
    @DisplayName("Should create audit log with all fields")
    void testCreateFullAuditLog() {
        // Arrange
        Long id = 1L;
        String actionType = "UPDATE_EVENT";
        String details = "Event was updated";
        LocalDateTime timestamp = LocalDateTime.now();

        // Act
        auditLog.setId(id);
        auditLog.setUser(testUser);
        auditLog.setActionType(actionType);
        auditLog.setDetails(details);
        auditLog.setTimestamp(timestamp);

        // Assert
        assertEquals(id, auditLog.getId());
        assertEquals(testUser, auditLog.getUser());
        assertEquals(actionType, auditLog.getActionType());
        assertEquals(details, auditLog.getDetails());
        assertEquals(timestamp, auditLog.getTimestamp());
    }

    @Test
    @DisplayName("Should handle empty action type")
    void testEmptyActionType() {
        // Act
        auditLog.setActionType("");

        // Assert
        assertEquals("", auditLog.getActionType());
    }

    @Test
    @DisplayName("Should handle action type with special characters")
    void testActionTypeWithSpecialCharacters() {
        // Arrange
        String actionType = "ACTION-TYPE_123!@#";

        // Act
        auditLog.setActionType(actionType);

        // Assert
        assertEquals(actionType, auditLog.getActionType());
    }

    @Test
    @DisplayName("Should update user reference")
    void testUpdateUserReference() {
        // Arrange
        User user1 = new User();
        user1.setId(1L);
        User user2 = new User();
        user2.setId(2L);

        // Act
        auditLog.setUser(user1);
        assertEquals(1L, auditLog.getUser().getId());
        
        auditLog.setUser(user2);
        assertEquals(2L, auditLog.getUser().getId());

        // Assert
        assertEquals(user2, auditLog.getUser());
    }
}
