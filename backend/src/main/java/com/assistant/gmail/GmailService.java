package com.assistant.gmail;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import com.assistant.audit.Auditable;

import java.util.Map;

@Service
public class GmailService {

    private final WebClient webClient;
    private static final String GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

    /**
     * Lists recent messages
     */
    public Object listMessages(String query, int maxResults) {
        // URI template variables are fully encoded, so '&', '#' or '{' in a search stay part of q
        WebClient.RequestHeadersSpec<?> request = (query != null && !query.isEmpty())
                ? webClient.get().uri(GMAIL_BASE_URL + "/messages?maxResults={max}&q={q}", maxResults, query)
                : webClient.get().uri(GMAIL_BASE_URL + "/messages?maxResults={max}", maxResults);

        return request
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Get specific message details
     */
    public Object getMessage(String id) {
        return webClient.get()
                .uri(GMAIL_BASE_URL + "/messages/" + id)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Send email
     * Uses the raw RFC 2822 format base64url encoded.
     */
    @Auditable(actionType = "SEND_EMAIL")
    public Object sendEmail(Map<String, String> payload) {
        // The payload map should contain a "raw" key mapped to the base64url encoded email string
        return webClient.post()
                .uri(GMAIL_BASE_URL + "/messages/send")
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    public GmailService(WebClient webClient) {
        this.webClient = webClient;
    }
}
