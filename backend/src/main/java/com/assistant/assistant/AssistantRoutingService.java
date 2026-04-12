package com.assistant.assistant;

import com.assistant.calendar.CalendarService;
import com.assistant.gmail.GmailService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
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
        ))
    );

    public AssistantRoutingService(WebClient.Builder webClientBuilder, GmailService gmailService, CalendarService calendarService, ObjectMapper objectMapper) {
        this.webClient = webClientBuilder.build();
        this.gmailService = gmailService;
        this.calendarService = calendarService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> parseIntent(String query) {
        if (openAiApiKey == null || openAiApiKey.isEmpty()) {
            return Map.of("action", "CHAT", "response", "OpenAI API Key is not configured.");
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", "You are an executive AI assistant. You have direct database access to organize the user's Gmail and Calendar. Use your provided tools to fetch context when they ask. Synthesize the raw JSON structures you receive into extremely readable human descriptions."));
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
                return gmailService.listMessages(q, 5);
            } else if ("fetch_upcoming_meetings".equals(name)) {
                Integer max = (Integer) args.get("maxResults");
                return calendarService.listUpcomingEvents(max != null ? max : 5);
            }
        } catch (Exception e) {
            e.printStackTrace();
            return Map.of("error", "Java Binding Execution Failed: " + e.getMessage());
        }
        return Map.of("error", "Unregistered Internal Tool Name");
    }
}
