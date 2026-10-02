package com.assistant.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("GlobalExceptionHandler - Exception Handling Tests")
class GlobalExceptionHandlerTest {

    @InjectMocks
    private GlobalExceptionHandler globalExceptionHandler;

    @Test
    @DisplayName("Should handle general exception and return INTERNAL_SERVER_ERROR")
    void testHandleAllExceptions() {
        // Arrange
        String exceptionMessage = "Test exception message";
        Exception testException = new Exception(exceptionMessage);

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        // Assert
        assertNotNull(response);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(500, response.getBody().getStatus());
        assertEquals(exceptionMessage, response.getBody().getMessage());
        assertNotNull(response.getBody().getTimestamp());
    }

    @Test
    @DisplayName("Should include timestamp in error response")
    void testErrorResponseIncludesTimestamp() {
        // Arrange
        Exception testException = new Exception("Error occurred");
        LocalDateTime beforeException = LocalDateTime.now();

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        LocalDateTime afterException = LocalDateTime.now();

        // Assert
        assertNotNull(response.getBody());
        LocalDateTime timestamp = response.getBody().getTimestamp();
        assertNotNull(timestamp);
        assertTrue(timestamp.isAfter(beforeException.minusSeconds(1)));
        assertTrue(timestamp.isBefore(afterException.plusSeconds(1)));
    }

    @Test
    @DisplayName("Should handle null exception message")
    void testHandleExceptionWithNullMessage() {
        // Arrange
        Exception testException = new Exception((String) null);

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        // Assert
        assertNotNull(response);
        assertEquals(500, response.getBody().getStatus());
        assertNull(response.getBody().getMessage());
    }

    @Test
    @DisplayName("Should handle various exception types")
    void testHandleVariousExceptionTypes() {
        // Arrange
        Exception[] exceptions = {
            new IllegalArgumentException("Invalid argument"),
            new NullPointerException("Null pointer"),
            new RuntimeException("Runtime error"),
            new Exception("Generic error")
        };

        // Act & Assert
        for (Exception ex : exceptions) {
            ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
                globalExceptionHandler.handleAllExceptions(ex);
            
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals(500, response.getBody().getStatus());
            assertEquals(ex.getMessage(), response.getBody().getMessage());
        }
    }

    @Test
    @DisplayName("Should preserve original exception message in response")
    void testExceptionMessagePreservation() {
        // Arrange
        String originalMessage = "Original exception message with special chars: !@#$%^&*()";
        Exception testException = new Exception(originalMessage);

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        // Assert
        assertEquals(originalMessage, response.getBody().getMessage());
    }

    @Test
    @DisplayName("ErrorResponse should have all required fields")
    void testErrorResponseFields() {
        // Arrange
        GlobalExceptionHandler.ErrorResponse errorResponse = 
            new GlobalExceptionHandler.ErrorResponse(500, "Test message", LocalDateTime.now());

        // Act & Assert
        assertNotNull(errorResponse.getStatus());
        assertNotNull(errorResponse.getMessage());
        assertNotNull(errorResponse.getTimestamp());
        assertEquals(500, errorResponse.getStatus());
        assertEquals("Test message", errorResponse.getMessage());
    }

    @Test
    @DisplayName("Should handle exception with cause chain")
    void testHandleExceptionWithCause() {
        // Arrange
        Exception cause = new IllegalArgumentException("Root cause");
        Exception testException = new Exception("Wrapper exception", cause);

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        // Assert
        assertNotNull(response);
        assertEquals("Wrapper exception", response.getBody().getMessage());
        assertEquals(500, response.getBody().getStatus());
    }

    @Test
    @DisplayName("Should always return INTERNAL_SERVER_ERROR status code")
    void testAlwaysReturnsInternalServerError() {
        // Arrange
        Exception[] exceptions = {
            new Exception("Error 1"),
            new IllegalArgumentException("Error 2"),
            new RuntimeException("Error 3")
        };

        // Act & Assert
        for (Exception ex : exceptions) {
            ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
                globalExceptionHandler.handleAllExceptions(ex);
            
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        }
    }

    @Test
    @DisplayName("Should handle empty exception message")
    void testHandleEmptyExceptionMessage() {
        // Arrange
        Exception testException = new Exception("");

        // Act
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = 
            globalExceptionHandler.handleAllExceptions(testException);

        // Assert
        assertNotNull(response);
        assertEquals("", response.getBody().getMessage());
        assertEquals(500, response.getBody().getStatus());
    }
}
