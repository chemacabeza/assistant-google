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
            "description", "Schedules a new event directly on the user's Google Calendar. For driving/travel events, always use: colorId '11' (red), visibility 'private', and a short description with the route name or street. Reminders are automatically added.",
            "parameters", Map.of(
                "type", "object",
                "properties", new java.util.LinkedHashMap<String, Object>() {{
                    put("summary", Map.of("type", "string", "description", "Title of the calendar event. For driving events use format: 'Drive from [Origin] to [Destination]'"));
                    put("description", Map.of("type", "string", "description", "Short description or notes for the event (e.g. route name like 'B96a', or destination street name)"));
                    put("location", Map.of("type", "string", "description", "Destination address for the event (optional)"));
                    put("startTimeISO", Map.of("type", "string", "description", "Start time in strict ISO 8601 format (e.g., 2026-04-13T15:00:00+02:00)"));
                    put("endTimeISO", Map.of("type", "string", "description", "End time in strict ISO 8601 format (e.g., 2026-04-13T16:00:00+02:00)"));
                    put("originAddress", Map.of("type", "string", "description", "Starting location for generating a Google Maps route Link (optional)"));
                    put("destinationAddress", Map.of("type", "string", "description", "Ending location for generating a Google Maps route Link (optional)"));
                    put("colorId", Map.of("type", "string", "description", "Google Calendar color ID. Use '11' (red/tomato) for driving/travel events. Other options: '1' lavender, '2' sage, '3' grape, '4' flamingo, '5' banana, '6' tangerine, '7' peacock, '8' graphite, '9' blueberry, '10' basil"));
                    put("visibility", Map.of("type", "string", "description", "Event visibility: 'private' or 'public'. Use 'private' for personal/driving events."));
                    put("attendeeEmails", Map.of(
                        "type", "array", 
                        "description", "A list of exact email addresses to formally invite to the calendar event",
                        "items", Map.of("type", "string")
                    ));
                }},
                "required", List.of("summary", "startTimeISO", "endTimeISO")
            )
        )),
        Map.of("type", "function", "function", Map.of(
            "name", "search_google_contacts",
            "description", "Searches for or fetches the user's Google Contacts. If a query is provided, it searches for specific people by name or email. Otherwise, it returns a full aggregation of contacts.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of(
                    "query", Map.of("type", "string", "description", "Optional search query (e.g., a person's name like 'Jennifer')")
                )
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
        String prompt = "You are an executive AI assistant. The current server date and time is " + ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME) + ". You have direct database access to organize the user's Gmail and Calendar. Formulate your answers mapping exact calendar structures relative to this real-time anchor. Synthesize the raw JSON structures you receive into extremely readable human descriptions. When directed to plan travel, evaluate the precise distance using maps and optionally insert blocker blocks onto the calendar if requested to do so. CRITICAL INSTRUCTION: If the maps API returns an error or REQUEST_DENIED, you MUST autonomously estimate the travel time yourself using your internal geographical knowledge and immediately schedule the requested calendar blocks based on your estimate without asking for the user's permission first. DRIVING EVENT FORMATTING: When creating drive/travel calendar events, ALWAYS apply these defaults: title format 'Drive from [Origin] to [Destination]', colorId '11' (red), visibility 'private', set the description to the destination street name or route name, set location to the destination address, and always include originAddress and destinationAddress for Google Maps directions. Reminders (10 min and 30 min popups) are automatically added to all events. NAME RESOLUTION: If the user mentions a person by name (e.g., 'Jennifer Lee Hillestad') and you need their email for a tool, use `search_google_contacts` with that name as the query to find their exact associated email address. ";
            + "MULTI-LEG ROUTING WITH FIXED ARRIVAL TIME — THIS IS CRITICAL: "
            + "When the user says 'I need to arrive at [final destination] at [TIME]', the LAST event's endTime MUST equal [TIME]. "
            + "STEP 1: Calculate ALL leg durations first using calculate_drive_duration. "
            + "STEP 2: Work BACKWARDS from the final arrival time. The LAST leg's endTime = the user's requested arrival time. The LAST leg's startTime = endTime minus its duration. "
            + "STEP 3: The preceding leg's endTime = the LAST leg's startTime. The preceding leg's startTime = its endTime minus its duration. "
            + "EXAMPLE: User says 'arrive at C at 16:00'. Leg1 (A→B) = 22 min, Leg2 (B→C) = 8 min. "
            + "Leg2 endTime = 16:00, Leg2 startTime = 15:52. Leg1 endTime = 15:52, Leg1 startTime = 15:30. "
            + "WRONG: Leg1 = 15:38-16:00, Leg2 = 16:00-16:08. This would arrive at C at 16:08, which is LATE. "
            + "CORRECT: Leg1 = 15:30-15:52, Leg2 = 15:52-16:00. This arrives at C at exactly 16:00. "
            + "NEVER set the last event to START at the arrival time. The last event must END at the arrival time. "
            + "LANGUAGE: You are fully bilingual in English and Spanish. Always detect the language the user writes in and respond in that same language. If the user writes in Spanish, respond entirely in Spanish. If the user writes in English, respond in English. Calendar event titles and descriptions should also match the user's language.";
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
                String query = (String) args.get("query");
                if (query != null && !query.isEmpty()) {
                    return contactsService.searchPeople(query);
                }
                return contactsService.fetchGoogleContacts();
            } else if ("schedule_calendar_event".equals(name)) {
                String summary = (String) args.get("summary");
                String description = (String) args.get("description");
                String location = (String) args.get("location");
                String start = (String) args.get("startTimeISO");
                String end = (String) args.get("endTimeISO");
                String origin = (String) args.get("originAddress");
                String dest = (String) args.get("destinationAddress");
                String colorId = (String) args.get("colorId");
                String visibility = (String) args.get("visibility");

                List<String> attendeeEmails = (List<String>) args.get("attendeeEmails");
                
                Map<String, Object> payload = new HashMap<>();
                payload.put("summary", summary);
                if (description != null && !description.isEmpty()) payload.put("description", description);
                if (location != null && !location.isEmpty()) payload.put("location", location);
                payload.put("start", Map.of("dateTime", start));
                payload.put("end", Map.of("dateTime", end));

                // Color (e.g. "11" = red/tomato for driving events)
                if (colorId != null && !colorId.isEmpty()) payload.put("colorId", colorId);

                // Visibility ("private" or "public")
                if (visibility != null && !visibility.isEmpty()) payload.put("visibility", visibility);

                // Always add 10-minute and 30-minute popup reminders
                Map<String, Object> reminders = new HashMap<>();
                reminders.put("useDefault", false);
                reminders.put("overrides", List.of(
                    Map.of("method", "popup", "minutes", 10),
                    Map.of("method", "popup", "minutes", 30)
                ));
                payload.put("reminders", reminders);

                // Google Maps directions source link
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
