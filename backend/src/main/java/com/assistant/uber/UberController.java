package com.assistant.uber;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/uber")
public class UberController {

    private final UberService uberService;

    public UberController(UberService uberService) {
        this.uberService = uberService;
    }

    /** Builds an Uber deep link that opens the app with the trip pre-filled. */
    @GetMapping("/ride-link")
    public ResponseEntity<UberService.RideLink> rideLink(@RequestParam String dropoff,
                                                         @RequestParam(required = false) String pickup,
                                                         @RequestParam(required = false) String nickname) {
        return ResponseEntity.ok(uberService.buildRideLink(pickup, dropoff, nickname));
    }
}
