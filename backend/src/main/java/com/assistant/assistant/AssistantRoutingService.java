package com.assistant.assistant;

import com.assistant.calendar.CalendarService;
import com.assistant.contacts.ContactsService;
import com.assistant.gmail.GmailService;
import com.assistant.maps.MapsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AssistantRoutingService {

    @Value("${OPENAI_API_KEY}")
    private String openAiApiKey;

    private final WebClient webClient;
    private final GmailService gmailService;
    private final CalendarService calendarService;
    private final MapsService mapsService;
    private final ContactsService contactsService;
    private final ObjectMapper objectMapper;

    // Define the rigid JSON schema for tools available to the Assistant
    private final List<Map<String, Object>> assistantTools = List.of(
        Map.of("type", "function", "function", Map.of(
            "name", "fetch_recent_emails",
            "description", "Fetches the user's most recent emails from Gmail. Returns an array of email objects.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "query", Map.of("type", "string", "description", "Optional search query to filter emails")
                )
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "fetch_upcoming_meetings",
            "description", "Fetches the user's upcoming Google Calendar events.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "maxResults", Map.of("type", "integer", "description", "Maximum number of events to return, default 5")
                )
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "calculate_drive_duration",
            "description", "Calculates the real-time driving duration between two locations using Google Maps.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "origin", Map.of("type", "string", "description", "Starting address or location"),
                    "destination", Map.of("type", "string", "description", "Destination address or location")
                ),
                "required", List.of("origin", "destination")
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "schedule_calendar_event",
            "description", "Schedules a new event directly on the user's Google Calendar.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "summary", Map.of("type", "string", "description", "Title of the calendar event"),
                    "location", Map.of("type", "string", "description", "Physical location address (optional)"),
                    "startTimeISO", Map.of("type", "string", "description", "Start time in strict ISO 8601 format (e.g., 2026-04-13T15:00:00+02:00)"),
                    "endTimeISO", Map.of("type", "string", "description", "End time in strict ISO 8601 format (e.g., 2026-04-13T16:00:00+02:00)"),
                    "originAddress", Map.of("type", "string", "description", "Starting location for generating a Google Maps route Link (optional)"),
                    "destinationAddress", Map.of("type", "string", "description", "Ending location for generating a Google Maps route Link (optional)"),
                    "attendeeEmails", Map.of(
                        "type", "array", 
                        "description", "A list of exact email addresses to formally invite to the calendar event",
                        "items", Map.of("type", "string")
                    )
                ),
                "required", List.of("summary", "startTimeISO", "endTimeISO")
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "search_google_contacts",
            "description", "Fetches the complete list of Google Contacts returning names and email arrays to parse exact invitees.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of()
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "send_email",
            "description", "Sends an email natively to an exact array of emails using the authenticated Gmail endpoint.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "toEmails", Map.of(
                        "type", "array",
                        "description", "Array of exact recipient email addresses",
                        "items", Map.of("type", "string")
                    ),
                    "subject", Map.of("type", "string", "description", "Subject line of the email"),
                    "content", Map.of("type", "string", "description", "The raw text content or summary to place in the body")
                ),
                "required", List.of("toEmails", "subject", "content")
            )
        ))
    );

    public AssistantRoutingService(WebClient.Builder webClientBuilder, GmailService gmailService, CalendarService calendarService, MapsService mapsService, ContactsService contactsService, ObjectMapper objectMapper) {
        this.webClient = webClientBuilder.build();
        this.gmailService = gmailService;
        this.calendarService = calendarService;
        this.mapsService = mapsService;
        this.contactsService = contactsService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> parseIntent(String query, List<Map<String, String>> history) {
        if (openAiApiKey == null || openAiApiKey.isEmpty()) {
            return Map.of("action", "CHAT", "response", "OpenAI API Key is not configured.");
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        String prompt = "You are an executive AI assistant. The current server date and time is " + ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME) + ". You have direct database access to organize the user's Gmail and Calendar. Formulate your answers mapping exact calendar structures relative to this real-time anchor. Synthesize the raw JSON structures you receive into extremely readable human descriptions. When directed to plan travel, evaluate the precise distance using maps and optionally insert blocker blocks onto the calendar if requested to do so. CRITICAL INSTRUCTION: If the maps API returns an error or REQUEST_DENIED, you MUST autonomously estimate the travel time yourself using your internal geographical knowledge and immediately schedule the requested calendar blocks based on your estimate without asking for the user's permission first.";
        messages.add(Map.of("role", "system", "content", prompt));
        
        if (history != null) {
            for(Map<String, String> h : history) {
                // Safely load prior user and assistant context arrays
                if(h.get("role") != null && h.get("content") != null) {
                    messages.add(Map.of("role", h.get("role"), "content", h.get("content")));
                }
            }
        }
        
        messages.add(Map.of("role", "user", "content", query));

        return callOpenAiWithTools(messages, query);
    }

    private Map<String, Object> callOpenAiWithTools(List<Map<String, Object>> messages, String originalQuery) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", "gpt-4o-mini");
        requestBody.put("messages", messages);
        requestBody.put("tools", assistantTools);

        try {
            Map response = webClient.post()
                    .uri("https://api.openai.com/v1/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + openAiApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String finishReason = (String) choices.get(0).get("finish_reason");

            // Recurse heavily if the AI opts to execute a specific Tool Function
            if ("tool_calls".equals(finishReason)) {
                messages.add(message); // append the exact tool_call configuration to conversational context

                List<Map<String, Object>> toolCalls = (List<Map<String, Object>>) message.get("tool_calls");
                for (Map<String, Object> toolCall : toolCalls) {
                    Map<String, Object> function = (Map<String, Object>) toolCall.get("function");
                    String name = (String) function.get("name");
                    String arguments = (String) function.get("arguments");

                    Object toolResult = executeInternalTool(name, arguments);

                    // Add tool output back so OpenAI can read the live result
                    messages.add(Map.of(
                        "role", "tool",
                        "tool_call_id", toolCall.get("id"),
                        "content", objectMapper.writeValueAsString(toolResult)
                    ));
                }

                // Recursively bounce back to OpenAI so it can formulate the final text UI using the data
                return callOpenAiWithTools(messages, originalQuery);
            }

            // Clean conversational string synthesis phase
            String gptResponse = (String) message.get("content");
            return Map.of(
                "action", "CHAT",
                "response", gptResponse,
                "rawQuery", originalQuery
            );
            
        } catch (Exception e) {
            e.printStackTrace();
            return Map.of(
                "action", "ERROR",
                "response", "Failed to interface with Autonomous Framework: " + e.getMessage(),
                "rawQuery", originalQuery
            );
        }
    }

    private Object executeInternalTool(String name, String argumentsJson) {
        try {
            Map<String, Object> args = objectMapper.readValue(argumentsJson, Map.class);
            if ("fetch_recent_emails".equals(name)) {
                String q = (String) args.get("query");
                Map<String, Object> listResult = (Map<String, Object>) gmailService.listMessages(q, 5);
                List<Map<String, Object>> messages = (List<Map<String, Object>>) listResult.get("messages");
                
                if (messages == null || messages.isEmpty()) {
                    return List.of();
                }

                List<Map<String, String>> richEmails = new ArrayList<>();
                for (Map<String, Object> msgStub : messages) {
                    String id = (String) msgStub.get("id");
                    Map<String, Object> details = (Map<String, Object>) gmailService.getMessage(id);
                    
                    String snippet = (String) details.getOrDefault("snippet", "");
                    Map<String, Object> payload = (Map<String, Object>) details.get("payload");
                    List<Map<String, String>> headers = payload != null ? (List<Map<String, String>>) payload.get("headers") : null;
                    
                    String subject = "(No Subject)";
                    String from = "(Unknown Sender)";
                    String date = "";
                    
                    if (headers != null) {
                        for (Map<String, String> header : headers) {
                            String headerName = header.get("name");
                            if ("Subject".equalsIgnoreCase(headerName)) subject = header.get("value");
                            else if ("From".equalsIgnoreCase(headerName)) from = header.get("value");
                            else if ("Date".equalsIgnoreCase(headerName)) date = header.get("value");
                        }
                    }
                    
                    richEmails.add(Map.of(
                        "id", id,
                        "subject", subject,
                        "from", from,
                        "date", date,
                        "snippet", snippet
                    ));
                }
                return richEmails;
            } else if ("fetch_upcoming_meetings".equals(name)) {
                Integer max = (Integer) args.get("maxResults");
                return calendarService.listUpcomingEvents(max != null ? max : 5);
            } else if ("calculate_drive_duration".equals(name)) {
                String origin = (String) args.get("origin");
                String destination = (String) args.get("destination");
                return mapsService.calculateDriveDuration(origin, destination);
            } else if ("search_google_contacts".equals(name)) {
                return contactsService.fetchGoogleContacts();
            } else if ("schedule_calendar_event".equals(name)) {
                String summary = (String) args.get("summary");
                String location = (String) args.get("location");
                String start = (String) args.get("startTimeISO");
                String end = (String) args.get("endTimeISO");
                String origin = (String) args.get("originAddress");
                String dest = (String) args.get("destinationAddress");
                List<String> attendeeEmails = (List<String>) args.get("attendeeEmails");
                
                Map<String, Object> payload = new HashMap<>();
                payload.put("summary", summary);
                if (location != null && !location.isEmpty()) payload.put("location", location);
                payload.put("start", Map.of("dateTime", start));
                payload.put("end", Map.of("dateTime", end));

                if (origin != null && !origin.isEmpty() && dest != null && !dest.isEmpty()) {
                    String url = "https://www.google.com/maps/dir/?api=1&origin=" + java.net.URLEncoder.encode(origin, "UTF-8") + "&destination=" + java.net.URLEncoder.encode(dest, "UTF-8");
                    payload.put("source", Map.of("title", "Google Maps directions", "url", url));
                }
                
                if (attendeeEmails != null && !attendeeEmails.isEmpty()) {
                    List<Map<String, String>> attendeesMap = new ArrayList<>();
                    for(String e : attendeeEmails) {
                        attendeesMap.add(Map.of("email", e));
                    }
                    payload.put("attendees", attendeesMap);
                }
                
                return calendarService.createEvent(payload);
            } else if ("send_email".equals(name)) {
                List<String> toEmails = (List<String>) args.get("toEmails");
                String subject = (String) args.get("subject");
                String content = (String) args.get("content");

                String rawMessage = "To: " + String.join(",", toEmails) + "\r\n" +
                                    "Subject: " + subject + "\r\n\r\n" +
                                    content;

                String encodedEmail = Base64.getUrlEncoder().encodeToString(rawMessage.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                return gmailService.sendEmail(Map.of("raw", encodedEmail));
            }
        } catch (Exception e) {
            e.printStackTrace();
            return Map.of("error", "Java Binding Execution Failed: " + e.getMessage());
        }
        return Map.of("error", "Unregistered Internal Tool Name");
    }
}
