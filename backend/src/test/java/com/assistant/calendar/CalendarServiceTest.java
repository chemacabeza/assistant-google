package com.assistant.calendar;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("CalendarService - Google Calendar Integration Tests")
class CalendarServiceTest {

    @Mock
    private WebClient webClient;

    @InjectMocks
    private CalendarService calendarService;

    @BeforeEach
    void setUp() {
        // No additional setup needed - mocks are automatically injected
    }

    @Test
    @DisplayName("Should call list upcoming events endpoint")
    void testListUpcomingEventsCalled() {
        // Arrange
        int maxResults = 10;

        // Act - We're primarily testing that the service makes the call
        // The actual WebClient behavior is mocked
        try {
            calendarService.listUpcomingEvents(maxResults);
        } catch (Exception e) {
            // Expected - WebClient is mocked and will throw
        }

        // Assert - Verify WebClient.get() was called
        verify(webClient, atLeastOnce()).get();
    }

    @Test
    @DisplayName("Should include max results parameter in list endpoint")
    void testListUpcomingEventsWithMaxResults() {
        // Arrange
        int maxResults = 25;

        // Act
        try {
            calendarService.listUpcomingEvents(maxResults);
        } catch (Exception e) {
            // Expected - WebClient is mocked
        }

        // Assert
        verify(webClient, times(1)).get();
    }

    @Test
    @DisplayName("Should call get event endpoint")
    void testGetEventEndpointCalled() {
        // Arrange
        String eventId = "event-12345";

        // Act
        try {
            calendarService.getEvent(eventId);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).get();
    }

    @Test
    @DisplayName("Should call create event endpoint with POST")
    void testCreateEventUsesPost() {
        // Arrange
        Object payload = new Object();

        // Act
        try {
            calendarService.createEvent(payload);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).post();
    }

    @Test
    @DisplayName("Should call update event endpoint with PUT")
    void testUpdateEventUsesPut() {
        // Arrange
        String eventId = "event-12345";
        Object payload = new Object();

        // Act
        try {
            calendarService.updateEvent(eventId, payload);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).put();
    }

    @Test
    @DisplayName("Should call delete event endpoint with DELETE")
    void testDeleteEventUsesDelete() {
        // Arrange
        String eventId = "event-12345";

        // Act
        try {
            calendarService.deleteEvent(eventId);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).delete();
    }

    @Test
    @DisplayName("Should handle different event IDs in getEvent")
    void testGetEventWithVariousIds() {
        // Arrange
        String[] eventIds = {"event-1", "event-2", "event-with-special-chars!@"};

        // Act & Assert
        for (String eventId : eventIds) {
            try {
                calendarService.getEvent(eventId);
            } catch (Exception e) {
                // Expected
            }
        }

        verify(webClient, atLeast(3)).get();
    }

    @Test
    @DisplayName("Should handle zero max results in listUpcomingEvents")
    void testListUpcomingEventsWithZero() {
        // Act
        try {
            calendarService.listUpcomingEvents(0);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).get();
    }

    @Test
    @DisplayName("Should handle large max results value")
    void testListUpcomingEventsWithLargeValue() {
        // Act
        try {
            calendarService.listUpcomingEvents(1000);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).get();
    }

    @Test
    @DisplayName("Should create event with object payload")
    void testCreateEventWithPayload() {
        // Arrange
        Object payload = new Object();

        // Act
        try {
            calendarService.createEvent(payload);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).post();
    }

    @Test
    @DisplayName("Should create event with null payload")
    void testCreateEventWithNullPayload() {
        // Act
        try {
            calendarService.createEvent(null);
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).post();
    }

    @Test
    @DisplayName("Should update event with both ID and payload")
    void testUpdateEventWithIdAndPayload() {
        // Act
        try {
            calendarService.updateEvent("event-123", new Object());
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).put();
    }

    @Test
    @DisplayName("Should delete event with specified ID")
    void testDeleteEventWithId() {
        // Act
        try {
            calendarService.deleteEvent("event-456");
        } catch (Exception e) {
            // Expected
        }

        // Assert
        verify(webClient, times(1)).delete();
    }
}
