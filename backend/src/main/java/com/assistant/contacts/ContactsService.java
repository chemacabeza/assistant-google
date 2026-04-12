package com.assistant.contacts;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class ContactsService {

    private static final Logger logger = LoggerFactory.getLogger(ContactsService.class);
    private final WebClient webClient;

    public ContactsService(WebClient webClient) {
        this.webClient = webClient;
    }

    public List<ContactDto> fetchGoogleContacts() {
        List<ContactDto> completeList = new ArrayList<>();

        // 1. Fetch Standard Connections (My Contacts)
        try {
            Map connsResponse = webClient.get()
                    .uri("https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&sortOrder=FIRST_NAME_ASCENDING&pageSize=1000")
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            
            List<ContactDto> conns = parseContacts(connsResponse, "connections");
            completeList.addAll(conns);
            logger.info("Successfully fetched {} explicit connections.", conns.size());
        } catch (WebClientResponseException e) {
            logger.warn("Failed fetching standard connections: {}", e.getMessage());
        } catch (Exception e) {
            logger.warn("Unknown error fetching standard connections", e);
        }

        // 2. Fetch Other Contacts (Auto-saved Gmail Contacts)
        try {
            Map otherResponse = webClient.get()
                    .uri("https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses&pageSize=1000")
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            
            List<ContactDto> others = parseContacts(otherResponse, "otherContacts");
            completeList.addAll(others);
            logger.info("Successfully fetched {} 'Other Contacts' from Gmail.", others.size());
        } catch (WebClientResponseException e) {
            logger.warn("Failed fetching Other Contacts (User likely has not authorized contacts.other.readonly yet): {}", e.getMessage());
        } catch (Exception e) {
            logger.warn("Unknown error fetching other contacts", e);
        }

        logger.info("Total Google Contacts successfully aggregated: {}", completeList.size());
        
        if (completeList.isEmpty()) {
             throw new RuntimeException("Could not load any contacts from either Connections or Other Contacts pools.");
        }

        return completeList;
    }

    private List<ContactDto> parseContacts(Map response, String propertyKey) {
        List<ContactDto> resultList = new ArrayList<>();
        if (response == null || !response.containsKey(propertyKey)) {
            return resultList;
        }

        List<Map<String, Object>> connections = (List<Map<String, Object>>) response.get(propertyKey);
        for (Map<String, Object> person : connections) {
            
            // Extract Name
            String name = "";
            if (person.containsKey("names")) {
                List<Map<String, Object>> names = (List<Map<String, Object>>) person.get("names");
                if (!names.isEmpty() && names.get(0).containsKey("displayName")) {
                    name = (String) names.get(0).get("displayName");
                }
            }

            // Extract Emails
            if (person.containsKey("emailAddresses")) {
                List<Map<String, Object>> emails = (List<Map<String, Object>>) person.get("emailAddresses");
                for (Map<String, Object> emailObj : emails) {
                    if (emailObj.containsKey("value")) {
                        String email = (String) emailObj.get("value");
                        resultList.add(new ContactDto(name, email));
                    }
                }
            }
        }

        return resultList;
    }

    public static class ContactDto {
        private String name;
        private String email;

        public ContactDto(String name, String email) {
            this.name = name;
            this.email = email;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
    }
}
