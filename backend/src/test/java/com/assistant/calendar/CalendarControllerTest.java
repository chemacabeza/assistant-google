package com.assistant.calendar;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CalendarController.class)
@DisplayName("CalendarController - /api/calendar/events")
class CalendarControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private CalendarService calendarService;

    @Test
    @DisplayName("GET lists upcoming events with maxResults defaulting to 10")
    void listDefault() throws Exception {
        when(calendarService.listUpcomingEvents(10)).thenReturn(Map.of("items", java.util.List.of(Map.of("id", "e1"))));

        mockMvc.perform(get("/api/calendar/events").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value("e1"));
    }

    @Test
    @DisplayName("GET honours maxResults and rejects non-numeric values with 400")
    void listMaxResults() throws Exception {
        when(calendarService.listUpcomingEvents(3)).thenReturn(Map.of());

        mockMvc.perform(get("/api/calendar/events").param("maxResults", "3").with(user())).andExpect(status().isOk());
        verify(calendarService).listUpcomingEvents(3);

        mockMvc.perform(get("/api/calendar/events").param("maxResults", "lots").with(user()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'maxResults'"));
    }

    @Test
    @DisplayName("GET /{id} returns one event")
    void getEvent() throws Exception {
        when(calendarService.getEvent("e1")).thenReturn(Map.of("id", "e1", "summary", "Standup"));

        mockMvc.perform(get("/api/calendar/events/e1").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary").value("Standup"));
    }

    @Test
    @DisplayName("POST forwards the JSON payload to Google")
    @SuppressWarnings("unchecked")
    void create() throws Exception {
        when(calendarService.createEvent(any())).thenReturn(Map.of("id", "new"));

        mockMvc.perform(post("/api/calendar/events").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"summary\":\"Lunch\",\"start\":{\"dateTime\":\"2026-10-06T12:00:00Z\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value("new"));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(calendarService).createEvent(payload.capture());
        assertThat((Map<String, Object>) payload.getValue()).containsEntry("summary", "Lunch");
    }

    @Test
    @DisplayName("PUT updates and DELETE removes an event")
    void updateAndDelete() throws Exception {
        when(calendarService.updateEvent(eq("e1"), any())).thenReturn(Map.of("id", "e1", "summary", "Moved"));

        mockMvc.perform(put("/api/calendar/events/e1").with(user()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"summary\":\"Moved\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary").value("Moved"));
        mockMvc.perform(delete("/api/calendar/events/e1").with(user()).with(csrf())).andExpect(status().isOk());

        verify(calendarService).deleteEvent("e1");
    }

    @Test
    @DisplayName("Google API errors surface as 502 with the upstream status")
    void upstreamErrorIs502() throws Exception {
        when(calendarService.getEvent("gone")).thenThrow(WebClientResponseException.create(
                HttpStatus.GONE.value(), "Gone", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        mockMvc.perform(get("/api/calendar/events/gone").with(user()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Upstream service responded with 410"));
    }

    @Test
    @DisplayName("Requires a session; mutations require CSRF")
    void security() throws Exception {
        mockMvc.perform(get("/api/calendar/events")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/calendar/events").with(user()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/calendar/events/e1").with(user()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/calendar/events/e1").with(user())).andExpect(status().isForbidden());
        verifyNoInteractions(calendarService);
    }
}
