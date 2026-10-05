package com.assistant.assistant;

import com.assistant.calendar.CalendarService;
import com.assistant.contacts.ContactsService;
import com.assistant.contacts.ContactsService.ContactDto;
import com.assistant.gmail.GmailService;
import com.assistant.maps.MapsService;
import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.whatsapp.WhatsAppService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("AssistantRoutingService - OpenAI tool-calling loop")
class AssistantRoutingServiceTest {

    private static final String FINAL_ANSWER = """
            {"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"All done."}}]}
            """;

    @Mock private GmailService gmailService;
    @Mock private CalendarService calendarService;
    @Mock private MapsService mapsService;
    @Mock private ContactsService contactsService;
    @Mock private WhatsAppService whatsAppService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private StubExchangeFunction openAi;
    private AssistantRoutingService service;

    @BeforeEach
    void setUp() {
        openAi = new StubExchangeFunction();
        service = new AssistantRoutingService(openAi.webClientBuilder(), gmailService, calendarService, mapsService,
                contactsService, whatsAppService, objectMapper);
        ReflectionTestUtils.setField(service, "openAiApiKey", "sk-test");
    }

    @AfterEach
    void clearInterruptFlag() {
        Thread.interrupted();
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /** An OpenAI response asking for a single tool call. */
    private String toolCall(String id, String name, Map<String, ?> arguments) throws Exception {
        Map<String, Object> call = Map.of(
                "id", id,
                "type", "function",
                "function", Map.of("name", name, "arguments", objectMapper.writeValueAsString(arguments)));
        return objectMapper.writeValueAsString(Map.of("choices", List.of(Map.of(
                "finish_reason", "tool_calls",
                "message", Map.of("role", "assistant", "tool_calls", List.of(call))))));
    }

    private String rawToolCall(String name, String rawArguments) throws Exception {
        Map<String, Object> call = Map.of("id", "call_raw", "type", "function",
                "function", Map.of("name", name, "arguments", rawArguments));
        return objectMapper.writeValueAsString(Map.of("choices", List.of(Map.of(
                "finish_reason", "tool_calls",
                "message", Map.of("role", "assistant", "tool_calls", List.of(call))))));
    }

    private Map<String, Object> requestBody(int index) throws Exception {
        return objectMapper.readValue(openAi.requests().get(index).body(), new TypeReference<>() {});
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> messagesOf(int requestIndex) throws Exception {
        return (List<Map<String, Object>>) requestBody(requestIndex).get("messages");
    }

    /** The JSON content of the tool message that was sent back to OpenAI in the second request. */
    private String toolResultContent() throws Exception {
        List<Map<String, Object>> messages = messagesOf(1);
        Map<String, Object> toolMessage = messages.get(messages.size() - 1);
        assertThat(toolMessage).containsEntry("role", "tool");
        return (String) toolMessage.get("content");
    }

    private Map<String, Object> runTool(String name, Map<String, ?> args) throws Exception {
        openAi.enqueueJson(toolCall("call_1", name, args)).enqueueJson(FINAL_ANSWER);
        return service.parseIntent("do it", null);
    }

    // ── request shape ──────────────────────────────────────────────────────

    @Nested
    @DisplayName("Request to OpenAI")
    class RequestShape {

        @Test
        @DisplayName("Returns a CHAT message without calling OpenAI when no API key is configured")
        void noApiKey() {
            ReflectionTestUtils.setField(service, "openAiApiKey", "");

            Map<String, Object> result = service.parseIntent("hello", null);

            assertThat(result).containsEntry("action", "CHAT").containsEntry("response", "OpenAI API Key is not configured.");
            assertThat(openAi.requests()).isEmpty();
        }

        @Test
        @DisplayName("Sends model, bearer token, system prompt, history and the user query")
        void requestShape() throws Exception {
            openAi.enqueueJson(FINAL_ANSWER);
            List<Map<String, String>> history = List.of(
                    Map.of("role", "user", "content", "earlier question"),
                    Map.of("role", "assistant", "content", "earlier answer"),
                    Map.of("role", "user"));          // incomplete entries are skipped

            Map<String, Object> result = service.parseIntent("¿Qué tengo hoy?", history);

            assertThat(result).containsEntry("action", "CHAT")
                    .containsEntry("response", "All done.")
                    .containsEntry("rawQuery", "¿Qué tengo hoy?");

            var request = openAi.lastRequest();
            assertThat(request.uri().toString()).isEqualTo("https://api.openai.com/v1/chat/completions");
            assertThat(request.headers().getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer sk-test");
            assertThat(request.headers().getFirst(HttpHeaders.CONTENT_TYPE)).isEqualTo("application/json");

            Map<String, Object> body = requestBody(0);
            assertThat(body).containsEntry("model", "gpt-4o-mini");
            List<Map<String, Object>> messages = messagesOf(0);
            assertThat(messages).hasSize(4);
            assertThat(messages.get(0)).containsEntry("role", "system");
            assertThat((String) messages.get(0).get("content")).contains("executive AI assistant");
            assertThat(messages.get(1)).containsEntry("content", "earlier question");
            assertThat(messages.get(2)).containsEntry("role", "assistant").containsEntry("content", "earlier answer");
            assertThat(messages.get(3)).containsEntry("role", "user").containsEntry("content", "¿Qué tengo hoy?");
        }

        @Test
        @DisplayName("Advertises all eight internal tools")
        @SuppressWarnings("unchecked")
        void advertisesTools() throws Exception {
            openAi.enqueueJson(FINAL_ANSWER);

            service.parseIntent("hi", null);

            List<Map<String, Object>> tools = (List<Map<String, Object>>) requestBody(0).get("tools");
            assertThat(tools).extracting(t -> ((Map<String, Object>) t.get("function")).get("name"))
                    .containsExactlyInAnyOrder("fetch_recent_emails", "fetch_upcoming_meetings",
                            "calculate_travel_duration", "schedule_calendar_event", "search_google_contacts",
                            "send_email", "delete_calendar_event", "send_whatsapp_message");
            assertThat(tools).allSatisfy(t -> assertThat(t).containsEntry("type", "function"));
        }
    }

    // ── tool-call loop ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("Tool-call loop")
    class ToolLoop {

        @Test
        @DisplayName("Executes the requested tool, feeds the result back with its tool_call_id and returns the final answer")
        void singleRoundTrip() throws Exception {
            when(calendarService.listUpcomingEvents(3)).thenReturn(Map.of("items", List.of(Map.of("summary", "Standup"))));
            openAi.enqueueJson(toolCall("call_abc", "fetch_upcoming_meetings", Map.of("maxResults", 3)))
                  .enqueueJson(FINAL_ANSWER);

            Map<String, Object> result = service.parseIntent("meetings?", null);

            assertThat(result).containsEntry("action", "CHAT").containsEntry("response", "All done.");
            assertThat(openAi.requests()).hasSize(2);

            List<Map<String, Object>> second = messagesOf(1);
            // system, user, assistant(tool_calls), tool
            assertThat(second).hasSize(4);
            assertThat(second.get(2)).containsEntry("role", "assistant").containsKey("tool_calls");
            assertThat(second.get(3)).containsEntry("role", "tool").containsEntry("tool_call_id", "call_abc");
            assertThat((String) second.get(3).get("content")).isEqualTo("{\"items\":[{\"summary\":\"Standup\"}]}");
        }

        @Test
        @DisplayName("Keeps looping while OpenAI keeps asking for tools")
        void multipleRounds() throws Exception {
            when(calendarService.listUpcomingEvents(5)).thenReturn(List.of());
            when(contactsService.searchPeople("Ana")).thenReturn(List.of(new ContactDto("Ana", "ana@example.com")));
            openAi.enqueueJson(toolCall("c1", "fetch_upcoming_meetings", Map.of()))
                  .enqueueJson(toolCall("c2", "search_google_contacts", Map.of("query", "Ana")))
                  .enqueueJson(FINAL_ANSWER);

            Map<String, Object> result = service.parseIntent("x", null);

            assertThat(result).containsEntry("response", "All done.");
            assertThat(openAi.requests()).hasSize(3);
            List<Map<String, Object>> third = messagesOf(2);
            assertThat(third).extracting(m -> m.get("role"))
                    .containsExactly("system", "user", "assistant", "tool", "assistant", "tool");
            assertThat((String) third.get(5).get("content")).contains("ana@example.com");
        }

        @Test
        @DisplayName("Executes every tool call of a batched response")
        void batchedToolCalls() throws Exception {
            String batched = objectMapper.writeValueAsString(Map.of("choices", List.of(Map.of(
                    "finish_reason", "tool_calls",
                    "message", Map.of("role", "assistant", "tool_calls", List.of(
                            Map.of("id", "d1", "function", Map.of("name", "delete_calendar_event", "arguments", "{\"eventId\":\"e1\"}")),
                            Map.of("id", "d2", "function", Map.of("name", "delete_calendar_event", "arguments", "{\"eventId\":\"e2\"}"))))))));
            openAi.enqueueJson(batched).enqueueJson(FINAL_ANSWER);

            service.parseIntent("clear my day", null);

            verify(calendarService).deleteEvent("e1");
            verify(calendarService).deleteEvent("e2");
            assertThat(messagesOf(1)).filteredOn(m -> "tool".equals(m.get("role")))
                    .extracting(m -> m.get("tool_call_id")).containsExactly("d1", "d2");
        }
    }

    // ── individual tools ───────────────────────────────────────────────────

    @Nested
    @DisplayName("Tool dispatch")
    class ToolDispatch {

        @Test
        @DisplayName("fetch_recent_emails enriches message stubs with subject, sender, date and snippet")
        void fetchRecentEmails() throws Exception {
            when(gmailService.listMessages("is:unread", 5)).thenReturn(Map.of("messages", List.of(Map.of("id", "m1"), Map.of("id", "m2"))));
            when(gmailService.getMessage("m1")).thenReturn(Map.of(
                    "snippet", "Quarterly numbers",
                    "payload", Map.of("headers", List.of(
                            Map.of("name", "subject", "value", "Q3 report"),
                            Map.of("name", "From", "value", "boss@example.com"),
                            Map.of("name", "Date", "value", "Mon, 1 Sep 2026 10:00:00 +0200"),
                            Map.of("name", "X-Other", "value", "ignored")))));
            when(gmailService.getMessage("m2")).thenReturn(Map.of());

            runTool("fetch_recent_emails", Map.of("query", "is:unread"));

            List<Map<String, String>> emails = objectMapper.readValue(toolResultContent(), new TypeReference<>() {});
            assertThat(emails).hasSize(2);
            assertThat(emails.get(0)).containsEntry("id", "m1").containsEntry("subject", "Q3 report")
                    .containsEntry("from", "boss@example.com").containsEntry("date", "Mon, 1 Sep 2026 10:00:00 +0200")
                    .containsEntry("snippet", "Quarterly numbers");
            assertThat(emails.get(1)).containsEntry("id", "m2").containsEntry("subject", "(No Subject)")
                    .containsEntry("from", "(Unknown Sender)").containsEntry("date", "").containsEntry("snippet", "");
        }

        @Test
        @DisplayName("fetch_recent_emails returns [] when the mailbox query has no messages")
        void fetchRecentEmailsEmpty() throws Exception {
            when(gmailService.listMessages(null, 5)).thenReturn(Map.of("resultSizeEstimate", 0));

            runTool("fetch_recent_emails", Map.of());

            assertThat(toolResultContent()).isEqualTo("[]");
            verify(gmailService, never()).getMessage(any());
        }

        @Test
        @DisplayName("fetch_upcoming_meetings defaults to 5 results")
        void fetchUpcomingMeetingsDefault() throws Exception {
            when(calendarService.listUpcomingEvents(5)).thenReturn(Map.of("items", List.of()));

            runTool("fetch_upcoming_meetings", Map.of());

            verify(calendarService).listUpcomingEvents(5);
        }

        @Test
        @DisplayName("calculate_travel_duration forwards origin, destination and mode to MapsService")
        void calculateTravelDuration() throws Exception {
            when(mapsService.calculateTravelDuration("Home", "Office", "transit")).thenReturn(Map.of("status", "OK"));

            runTool("calculate_travel_duration", Map.of("origin", "Home", "destination", "Office", "travelMode", "transit"));

            assertThat(toolResultContent()).isEqualTo("{\"status\":\"OK\"}");
        }

        @Test
        @DisplayName("search_google_contacts without a query fetches the full contact list")
        void searchContactsWithoutQuery() throws Exception {
            when(contactsService.fetchGoogleContacts()).thenReturn(List.of(new ContactDto("Bob", "bob@example.com")));

            runTool("search_google_contacts", Map.of("query", ""));

            verify(contactsService, never()).searchPeople(any());
            assertThat(toolResultContent()).contains("bob@example.com");
        }

        @Test
        @DisplayName("schedule_calendar_event builds the payload with reminders, colour, visibility, navigation link and attendees")
        @SuppressWarnings("unchecked")
        void scheduleCalendarEventFull() throws Exception {
            when(calendarService.createEvent(any())).thenReturn(Map.of("id", "evt-1"));

            runTool("schedule_calendar_event", Map.of(
                    "summary", "Drive from Home to Work",
                    "description", "B96a",
                    "location", "Work St 1, Berlin",
                    "startTimeISO", "2026-04-13T15:00:00+02:00",
                    "endTimeISO", "2026-04-13T15:30:00+02:00",
                    "originAddress", "Home Str. 5, Berlin",
                    "destinationAddress", "Work St 1, Berlin",
                    "colorId", "11",
                    "visibility", "private",
                    "attendeeEmails", List.of("a@example.com", "b@example.com")));

            ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
            verify(calendarService).createEvent(captor.capture());
            Map<String, Object> payload = (Map<String, Object>) captor.getValue();

            String expectedUrl = "https://www.google.com/maps/dir/?api=1&origin=Home+Str.+5%2C+Berlin&destination=Work+St+1%2C+Berlin";
            assertThat(payload).containsEntry("summary", "Drive from Home to Work")
                    .containsEntry("location", "Work St 1, Berlin")
                    .containsEntry("start", Map.of("dateTime", "2026-04-13T15:00:00+02:00"))
                    .containsEntry("end", Map.of("dateTime", "2026-04-13T15:30:00+02:00"))
                    .containsEntry("colorId", "11")
                    .containsEntry("visibility", "private")
                    .containsEntry("description", "B96a\n\n🚗 Android Auto: " + expectedUrl)
                    .containsEntry("source", Map.of("title", "Google Maps directions", "url", expectedUrl))
                    .containsEntry("attendees", List.of(Map.of("email", "a@example.com"), Map.of("email", "b@example.com")));
            assertThat(payload.get("reminders")).isEqualTo(Map.of("useDefault", false, "overrides", List.of(
                    Map.of("method", "popup", "minutes", 10), Map.of("method", "popup", "minutes", 30))));
            assertThat(toolResultContent()).isEqualTo("{\"id\":\"evt-1\"}");
        }

        @Test
        @DisplayName("schedule_calendar_event falls back to the location for a destination-only navigation link")
        @SuppressWarnings("unchecked")
        void scheduleCalendarEventLocationOnly() throws Exception {
            when(calendarService.createEvent(any())).thenReturn(Map.of());

            runTool("schedule_calendar_event", Map.of(
                    "summary", "Dentist", "location", "Main St 3",
                    "startTimeISO", "2026-04-13T09:00:00Z", "endTimeISO", "2026-04-13T10:00:00Z"));

            ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
            verify(calendarService).createEvent(captor.capture());
            Map<String, Object> payload = (Map<String, Object>) captor.getValue();
            assertThat(payload.get("description"))
                    .isEqualTo("\n\n🚗 Android Auto: https://www.google.com/maps/dir/?api=1&destination=Main+St+3");
            assertThat(payload).doesNotContainKeys("colorId", "visibility", "attendees");
        }

        @Test
        @DisplayName("schedule_calendar_event without any address adds no description, link or source")
        @SuppressWarnings("unchecked")
        void scheduleCalendarEventNoAddress() throws Exception {
            when(calendarService.createEvent(any())).thenReturn(Map.of());

            runTool("schedule_calendar_event", Map.of(
                    "summary", "Focus", "startTimeISO", "2026-04-13T09:00:00Z", "endTimeISO", "2026-04-13T10:00:00Z",
                    "attendeeEmails", List.of()));

            ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
            verify(calendarService).createEvent(captor.capture());
            assertThat((Map<String, Object>) captor.getValue())
                    .doesNotContainKeys("description", "location", "source", "attendees")
                    .containsKeys("summary", "start", "end", "reminders");
        }

        @Test
        @DisplayName("send_email builds an RFC 5322 message for all recipients and sends it through Gmail")
        @SuppressWarnings("unchecked")
        void sendEmail() throws Exception {
            when(gmailService.sendEmail(any())).thenReturn(Map.of("id", "sent"));

            runTool("send_email", Map.of("toEmails", List.of("a@example.com", "b@example.com"),
                    "subject", "Agenda", "content", "See you at 10"));

            ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
            verify(gmailService).sendEmail(captor.capture());
            String mime = new String(Base64.getUrlDecoder().decode(captor.getValue().get("raw")), StandardCharsets.UTF_8);
            assertThat(mime).contains("To: a@example.com, b@example.com").contains("Subject: Agenda")
                    .contains(Base64.getEncoder().encodeToString("See you at 10".getBytes(StandardCharsets.UTF_8)))
                    .doesNotContain("From:");
        }

        @Test
        @DisplayName("delete_calendar_event deletes by id and reports success")
        void deleteCalendarEvent() throws Exception {
            runTool("delete_calendar_event", Map.of("eventId", "evt-9"));

            verify(calendarService).deleteEvent("evt-9");
            assertThat(objectMapper.readValue(toolResultContent(), Map.class))
                    .containsEntry("success", true).containsEntry("message", "Event deleted successfully");
        }

        @Test
        @DisplayName("send_whatsapp_message sends through the bridge and reports the recipient")
        void sendWhatsApp() throws Exception {
            runTool("send_whatsapp_message", Map.of("to", "+33123456789", "content", "On my way"));

            verify(whatsAppService).sendTextMessage("+33123456789", "On my way");
            assertThat(objectMapper.readValue(toolResultContent(), Map.class))
                    .containsEntry("message", "WhatsApp message sent to +33123456789");
        }

        @Test
        @DisplayName("An unknown tool name is reported back to the model as an error")
        void unknownTool() throws Exception {
            runTool("launch_rocket", Map.of());

            assertThat(toolResultContent()).isEqualTo("{\"error\":\"Unregistered Internal Tool Name\"}");
            verifyNoInteractions(gmailService, calendarService, mapsService, contactsService, whatsAppService);
        }

        @Test
        @DisplayName("A failing tool is reported back to the model instead of aborting the conversation")
        void failingTool() throws Exception {
            when(calendarService.listUpcomingEvents(5)).thenThrow(new IllegalStateException("token expired"));

            Map<String, Object> result = runTool("fetch_upcoming_meetings", Map.of());

            assertThat(result).containsEntry("action", "CHAT");
            assertThat(toolResultContent()).isEqualTo("{\"error\":\"Java Binding Execution Failed: token expired\"}");
        }

        @Test
        @DisplayName("Malformed tool arguments are reported back as a tool error")
        void malformedArguments() throws Exception {
            openAi.enqueueJson(rawToolCall("delete_calendar_event", "{not json")).enqueueJson(FINAL_ANSWER);

            service.parseIntent("x", null);

            assertThat(toolResultContent()).startsWith("{\"error\":\"Java Binding Execution Failed:");
            verifyNoInteractions(calendarService);
        }
    }

    // ── error handling and retry ───────────────────────────────────────────

    @Nested
    @DisplayName("Errors and rate-limit retry")
    class Errors {

        @Test
        @DisplayName("A non-429 OpenAI error is not retried and surfaces as an ERROR action")
        void nonRateLimitErrorNotRetried() {
            openAi.enqueue(HttpStatus.UNAUTHORIZED, "{\"error\":{\"message\":\"bad key\"}}");

            Map<String, Object> result = service.parseIntent("hi", null);

            assertThat(openAi.requests()).hasSize(1);
            assertThat(result).containsEntry("action", "ERROR").containsEntry("rawQuery", "hi");
            assertThat((String) result.get("response")).startsWith("Failed to interface with Autonomous Framework:").contains("401");
        }

        @Test
        @DisplayName("A 429 schedules a retry (backoff observed without sleeping by interrupting the wait)")
        void rateLimitTriggersBackoff() {
            openAi.enqueue(HttpStatus.TOO_MANY_REQUESTS, "{}").enqueueJson(FINAL_ANSWER);
            // The service sleeps between attempts; with the interrupt flag set the sleep aborts immediately,
            // proving the 429 took the backoff path instead of failing straight away.
            Thread.currentThread().interrupt();

            Map<String, Object> result = service.parseIntent("hi", null);

            assertThat(Thread.interrupted()).as("interrupt flag is restored").isTrue();
            assertThat(openAi.requests()).hasSize(1);
            assertThat(result).containsEntry("action", "ERROR")
                    .containsEntry("response", "Failed to interface with Autonomous Framework: Retry interrupted");
        }

        @Test
        @DisplayName("After a 429 the request is retried and the successful answer is returned (waits the 2s first backoff)")
        void rateLimitRetrySucceeds() throws Exception {
            openAi.enqueue(HttpStatus.TOO_MANY_REQUESTS, "{}").enqueueJson(FINAL_ANSWER);

            long start = System.nanoTime();
            Map<String, Object> result = service.parseIntent("hi", null);
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;

            assertThat(result).containsEntry("action", "CHAT").containsEntry("response", "All done.");
            assertThat(openAi.requests()).hasSize(2);
            assertThat(openAi.requests().get(1).body()).isEqualTo(openAi.requests().get(0).body());
            assertThat(elapsedMs).isGreaterThanOrEqualTo(2000);
        }

        @Test
        @DisplayName("A malformed OpenAI response surfaces as an ERROR action")
        void malformedResponse() {
            openAi.enqueueJson("{\"choices\":[]}");

            Map<String, Object> result = service.parseIntent("hi", null);

            assertThat(result).containsEntry("action", "ERROR");
        }
    }
}
