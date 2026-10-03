package com.assistant.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpHeaders;

import java.net.URI;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@DisplayName("GlobalExceptionHandler - HTTP status mapping")
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    // ── 4xx ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Malformed JSON body answers 400 without echoing the parser message")
    void malformedBodyIs400() {
        HttpMessageNotReadableException ex = new HttpMessageNotReadableException(
                "JSON parse error: Unexpected character at com.fasterxml.jackson", mock(HttpInputMessage.class));

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleUnreadableBody(ex);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(400, response.getBody().getStatus());
        assertEquals("Malformed or missing request body", response.getBody().getMessage());
        assertFalse(response.getBody().getMessage().contains("jackson"));
    }

    @Test
    @DisplayName("Missing request parameter answers 400 and names the parameter")
    void missingParameterIs400() {
        MissingServletRequestParameterException ex = new MissingServletRequestParameterException("hub.mode", "String");

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleMissingParameter(ex);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Missing required parameter 'hub.mode'", response.getBody().getMessage());
    }

    @Test
    @DisplayName("Parameter type mismatch answers 400 and names the parameter")
    void typeMismatchIs400() {
        MethodArgumentTypeMismatchException ex = new MethodArgumentTypeMismatchException(
                "abc", Integer.class, "maxResults", mock(MethodParameter.class), new NumberFormatException("abc"));

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleTypeMismatch(ex);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Invalid value for parameter 'maxResults'", response.getBody().getMessage());
    }

    @Test
    @DisplayName("Bean validation failure answers 400 listing the invalid fields")
    void validationFailureIs400() {
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(new Object(), "template");
        binding.addError(new FieldError("template", "title", "must not be blank"));
        binding.addError(new FieldError("template", "content", "must not be blank"));
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(mock(MethodParameter.class), binding);

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleValidation(ex);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Validation failed: content must not be blank, title must not be blank", response.getBody().getMessage());
    }

    @Test
    @DisplayName("IllegalArgumentException answers 400 with its message")
    void illegalArgumentIs400() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleIllegalArgument(new IllegalArgumentException("Account with this email already exists"));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Account with this email already exists", response.getBody().getMessage());
    }

    @Test
    @DisplayName("IllegalArgumentException without a message still answers 400")
    void illegalArgumentWithoutMessageIs400() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleIllegalArgument(new IllegalArgumentException());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Invalid request", response.getBody().getMessage());
    }

    @Test
    @DisplayName("Unsupported HTTP method answers 405")
    void methodNotSupportedIs405() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleMethodNotSupported(new HttpRequestMethodNotSupportedException("PATCH"));

        assertEquals(HttpStatus.METHOD_NOT_ALLOWED, response.getStatusCode());
        assertEquals(405, response.getBody().getStatus());
    }

    @Test
    @DisplayName("Unsupported media type answers 415")
    void mediaTypeNotSupportedIs415() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleMediaTypeNotSupported(new HttpMediaTypeNotSupportedException("text/plain"));

        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, response.getStatusCode());
    }

    @Test
    @DisplayName("Unknown path answers 404")
    void unknownResourceIs404() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleNotFound(new NoResourceFoundException(HttpMethod.GET, "/api/nope"));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertEquals("Not found", response.getBody().getMessage());
    }

    @Test
    @DisplayName("AccessDeniedException answers 403 instead of 500")
    void accessDeniedIs403() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleAccessDenied(new AccessDeniedException("nope"));

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("Access denied", response.getBody().getMessage());
    }

    @Test
    @DisplayName("ResponseStatusException keeps the status and reason chosen by the controller")
    void responseStatusExceptionIsPassedThrough() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleErrorResponse(new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found"));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertEquals(404, response.getBody().getStatus());
        assertEquals("Template not found", response.getBody().getMessage());
    }

    @Test
    @DisplayName("ResponseStatusException without a reason falls back to the status phrase")
    void responseStatusExceptionWithoutReasonUsesPhrase() {
        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response =
                handler.handleErrorResponse(new ResponseStatusException(HttpStatus.CONFLICT));

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("Conflict", response.getBody().getMessage());
    }

    // ── 502 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("An upstream HTTP error answers 502 and reports only the upstream status")
    void upstreamErrorIs502() {
        WebClientResponseException ex = WebClientResponseException.create(
                401, "Unauthorized", HttpHeaders.EMPTY, "{\"error\":\"invalid_token ya29.secret\"}".getBytes(), null);

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleUpstreamResponse(ex);

        assertEquals(HttpStatus.BAD_GATEWAY, response.getStatusCode());
        assertEquals("Upstream service responded with 401", response.getBody().getMessage());
        assertFalse(response.getBody().getMessage().contains("ya29"));
    }

    @Test
    @DisplayName("An unreachable upstream answers 502")
    void unreachableUpstreamIs502() {
        WebClientRequestException ex = new WebClientRequestException(
                new java.net.ConnectException("Connection refused"), HttpMethod.GET,
                URI.create("http://whatsapp-bridge:3001/status"), HttpHeaders.EMPTY);

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleUpstreamUnreachable(ex);

        assertEquals(HttpStatus.BAD_GATEWAY, response.getStatusCode());
        assertEquals("Upstream service is unreachable", response.getBody().getMessage());
    }

    // ── 500 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Any other exception answers 500 with a generic message")
    void unexpectedExceptionIs500() {
        Exception[] exceptions = {
            new NullPointerException("Cannot invoke \"String.length()\" because \"s\" is null"),
            new RuntimeException("jdbc connection pool exhausted at com.zaxxer.hikari"),
            new Exception((String) null),
            new Exception(""),
        };

        for (Exception ex : exceptions) {
            ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleAllExceptions(ex);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode(), ex.toString());
            assertEquals(500, response.getBody().getStatus());
            assertEquals("Internal server error", response.getBody().getMessage(), ex.toString());
        }
    }

    @Test
    @DisplayName("Exception cause chains are not leaked either")
    void causeChainIsNotLeaked() {
        Exception ex = new Exception("Wrapper", new IllegalStateException("Root cause with internals"));

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleAllExceptions(ex);

        assertEquals("Internal server error", response.getBody().getMessage());
    }

    // ── body shape ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("Every error body carries status, message and a current timestamp")
    void errorBodyShape() {
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);

        ResponseEntity<GlobalExceptionHandler.ErrorResponse> response = handler.handleAllExceptions(new Exception("x"));

        GlobalExceptionHandler.ErrorResponse body = response.getBody();
        assertNotNull(body);
        assertEquals(500, body.getStatus());
        assertNotNull(body.getMessage());
        assertNotNull(body.getTimestamp());
        assertTrue(body.getTimestamp().isAfter(before));
        assertTrue(body.getTimestamp().isBefore(LocalDateTime.now().plusSeconds(1)));
    }

    @Test
    @DisplayName("ErrorResponse exposes its three fields")
    void errorResponseAccessors() {
        LocalDateTime now = LocalDateTime.now();
        GlobalExceptionHandler.ErrorResponse body = new GlobalExceptionHandler.ErrorResponse(418, "teapot", now);

        assertEquals(418, body.getStatus());
        assertEquals("teapot", body.getMessage());
        assertEquals(now, body.getTimestamp());
    }
}
