package com.assistant.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

/**
 * Maps exceptions to a stable JSON body: {@code {status, message, timestamp}}.
 *
 * Client mistakes (malformed JSON, missing parameters, wrong method) answer with
 * a 4xx and a short description of what was wrong. Failures of upstream services
 * (Google, OpenAI, the WhatsApp bridge) answer 502. Anything else is a 500 with a
 * generic message; the real exception is logged server-side and never echoed to
 * the caller.
 */
@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // ── 4xx: the request itself was wrong ───────────────────────────────────

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException ex) {
        return respond(HttpStatus.BAD_REQUEST, "Malformed or missing request body");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(MissingServletRequestParameterException ex) {
        return respond(HttpStatus.BAD_REQUEST, "Missing required parameter '" + ex.getParameterName() + "'");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return respond(HttpStatus.BAD_REQUEST, "Invalid value for parameter '" + ex.getName() + "'");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String details = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::describe)
                .sorted()
                .collect(Collectors.joining(", "));
        return respond(HttpStatus.BAD_REQUEST, details.isEmpty() ? "Validation failed" : "Validation failed: " + details);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        return respond(HttpStatus.BAD_REQUEST, ex.getMessage() != null ? ex.getMessage() : "Invalid request");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed");
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException ex) {
        return respond(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported content type");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoResourceFoundException ex) {
        return respond(HttpStatus.NOT_FOUND, "Not found");
    }

    /** Thrown by method security; without this handler it would surface as a 500. */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return respond(HttpStatus.FORBIDDEN, "Access denied");
    }

    /** Controllers may throw these to pick their own status; keep it and the reason. */
    @ExceptionHandler(ErrorResponseException.class)
    public ResponseEntity<ErrorResponse> handleErrorResponse(ErrorResponseException ex) {
        HttpStatusCode status = ex.getStatusCode();
        String reason = ex.getBody().getDetail();
        if (reason == null || reason.isBlank()) {
            HttpStatus resolved = HttpStatus.resolve(status.value());
            reason = resolved != null ? resolved.getReasonPhrase() : "Request failed";
        }
        return respond(status, reason);
    }

    // ── 502: an upstream service failed ─────────────────────────────────────

    @ExceptionHandler(WebClientResponseException.class)
    public ResponseEntity<ErrorResponse> handleUpstreamResponse(WebClientResponseException ex) {
        log.warn("Upstream call failed: {} {} -> {}", ex.getRequest() != null ? ex.getRequest().getMethod() : "?",
                ex.getRequest() != null ? ex.getRequest().getURI() : "?", ex.getStatusCode());
        return respond(HttpStatus.BAD_GATEWAY, "Upstream service responded with " + ex.getStatusCode().value());
    }

    @ExceptionHandler(WebClientRequestException.class)
    public ResponseEntity<ErrorResponse> handleUpstreamUnreachable(WebClientRequestException ex) {
        log.warn("Upstream call failed: {} {} -> {}", ex.getMethod(), ex.getUri(), ex.getMessage());
        return respond(HttpStatus.BAD_GATEWAY, "Upstream service is unreachable");
    }

    // ── 500: our fault ──────────────────────────────────────────────────────

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleAllExceptions(Exception ex) {
        log.error("Unhandled exception while serving request", ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static ResponseEntity<ErrorResponse> respond(HttpStatusCode status, String message) {
        return ResponseEntity.status(status).body(new ErrorResponse(status.value(), message, LocalDateTime.now()));
    }

    private static String describe(FieldError error) {
        String reason = error.getDefaultMessage();
        return error.getField() + (reason != null ? " " + reason : "");
    }

    public static class ErrorResponse {
        private final int status;
        private final String message;
        private final LocalDateTime timestamp;

        public ErrorResponse(int status, String message, LocalDateTime timestamp) {
            this.status = status;
            this.message = message;
            this.timestamp = timestamp;
        }

        public int getStatus() { return status; }
        public String getMessage() { return message; }
        public LocalDateTime getTimestamp() { return timestamp; }
    }
}
