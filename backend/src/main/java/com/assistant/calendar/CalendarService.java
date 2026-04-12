package com.assistant.calendar;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import com.assistant.audit.Auditable;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class CalendarService {

    private final WebClient webClient;
    private static final String CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/primary";

    public Object listUpcomingEvents(int maxResults) {
        String now = ZonedDateTime.now().format(DateTimeFormatter.ISO_INSTANT);
        String url = CALENDAR_BASE_URL + "/events?maxResults=" + maxResults +
                "&timeMin=" + now + "&singleEvents=true&orderBy=startTime";
                
        return webClient.get()
                .uri(url)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    public Object getEvent(String eventId) {
        return webClient.get()
                .uri(CALENDAR_BASE_URL + "/events/" + eventId)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    @Auditable(actionType = "CREATE_EVENT")
    public Object createEvent(Object payload) {
        return webClient.post()
                .uri(CALENDAR_BASE_URL + "/events")
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    @Auditable(actionType = "UPDATE_EVENT")
    public Object updateEvent(String eventId, Object payload) {
        return webClient.put()
                .uri(CALENDAR_BASE_URL + "/events/" + eventId)
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    @Auditable(actionType = "DELETE_EVENT")
    public void deleteEvent(String eventId) {
        webClient.delete()
                .uri(CALENDAR_BASE_URL + "/events/" + eventId)
                .retrieve()
                .bodyToMono(Void.class)
                .block();
    }

    public CalendarService(WebClient webClient) {
        this.webClient = webClient;
    }
}
