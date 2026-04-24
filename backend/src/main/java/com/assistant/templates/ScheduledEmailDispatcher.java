package com.assistant.templates;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.AuthorizedClientServiceOAuth2AuthorizedClientManager;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;

@Component
public class ScheduledEmailDispatcher {

    private static final Logger logger = LoggerFactory.getLogger(ScheduledEmailDispatcher.class);

    private final CustomAnswerTemplateRepository templateRepository;
    private final AuthorizedClientServiceOAuth2AuthorizedClientManager offlineAuthorizedClientManager;
    private final WebClient webClient;
    private static final String GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

    public ScheduledEmailDispatcher(CustomAnswerTemplateRepository templateRepository,
                                    AuthorizedClientServiceOAuth2AuthorizedClientManager offlineAuthorizedClientManager,
                                    WebClient.Builder webClientBuilder) {
        this.templateRepository = templateRepository;
        this.offlineAuthorizedClientManager = offlineAuthorizedClientManager;
        this.webClient = webClientBuilder.build();
    }

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void dispatchScheduledEmails() {
        LocalDateTime now = LocalDateTime.now();
        List<CustomAnswerTemplate> pendingTasks = templateRepository.findPendingScheduledEmails("PENDING", now);

        for (CustomAnswerTemplate task : pendingTasks) {
            try {
                String principalName = task.getUser().getEmail();
                
                // Create a generic pseudo-authentication to satisfy the AuthorizedClientManager
                Authentication pseudoAuth = new AnonymousAuthenticationToken("pseudo", principalName, AuthorityUtils.createAuthorityList("ROLE_USER"));

                OAuth2AuthorizeRequest authorizeRequest = OAuth2AuthorizeRequest.withClientRegistrationId("google")
                        .principal(pseudoAuth)
                        .build();

                OAuth2AuthorizedClient authorizedClient = offlineAuthorizedClientManager.authorize(authorizeRequest);

                if (authorizedClient == null || authorizedClient.getAccessToken() == null) {
                    logger.error("Could not obtain OAuth2 token for user: {}", principalName);
                    markAsFailed(task);
                    continue;
                }

                String accessToken = authorizedClient.getAccessToken().getTokenValue();

                // Construct raw email RFC 2822 payload
                String fromHeader = (task.getFromEmail() != null && !task.getFromEmail().isEmpty()) 
                                    ? "From: " + task.getFromEmail() + "\r\n" : "";
                String rawEmail = fromHeader + 
                                  "To: " + task.getTargetEmail() + "\r\n" +
                                  "Subject: " + task.getTitle() + "\r\n\r\n" +
                                  task.getContent();
                
                String base64EncodedEmail = Base64.getUrlEncoder().withoutPadding().encodeToString(rawEmail.getBytes());

                Map<String, String> payload = new HashMap<>();
                payload.put("raw", base64EncodedEmail);

                webClient.post()
                        .uri(GMAIL_SEND_URL)
                        .header("Authorization", "Bearer " + accessToken)
                        .bodyValue(payload)
                        .retrieve()
                        .bodyToMono(Object.class)
                        .block();

                logger.info("Successfully dispatched scheduled email task ID: {}", task.getId());
                task.setStatus("SENT");
                templateRepository.save(task);

            } catch (Exception e) {
                logger.error("Failed to execute scheduled email task ID: {}", task.getId(), e);
                markAsFailed(task);
            }
        }
    }

    private void markAsFailed(CustomAnswerTemplate task) {
        task.setStatus("FAILED");
        templateRepository.save(task);
    }
}
