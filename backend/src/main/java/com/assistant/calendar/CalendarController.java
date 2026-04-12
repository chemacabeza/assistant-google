package com.assistant.calendar;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/calendar/events")
public class CalendarController {

    private final CalendarService calendarService;

    @GetMapping
    public ResponseEntity<?> getUpcomingEvents(@RequestParam(defaultValue = "10") int maxResults) {
        return ResponseEntity.ok(calendarService.listUpcomingEvents(maxResults));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getEventDetails(@PathVariable String id) {
        return ResponseEntity.ok(calendarService.getEvent(id));
    }

    @PostMapping
    public ResponseEntity<?> createEvent(@RequestBody Object payload) {
        return ResponseEntity.ok(calendarService.createEvent(payload));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateEvent(@PathVariable String id, @RequestBody Object payload) {
        return ResponseEntity.ok(calendarService.updateEvent(id, payload));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteEvent(@PathVariable String id) {
        calendarService.deleteEvent(id);
        return ResponseEntity.ok().build();
    }

    public CalendarController(CalendarService calendarService) {
        this.calendarService = calendarService;
    }
}
