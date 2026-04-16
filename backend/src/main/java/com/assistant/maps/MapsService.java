package com.assistant.maps;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Service
public class MapsService {
    @Value("${VITE_GOOGLE_MAPS_API_KEY}")
    private String mapsApiKey;

    private final WebClient webClient;

    public MapsService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public Object calculateTravelDuration(String origin, String destination, String mode) {
        if (mapsApiKey == null || mapsApiKey.isEmpty()) {
            return Map.of("error", "Maps API Key is not bound to server layer.");
        }
        
        String travelMode = (mode != null && !mode.isEmpty()) ? mode.toLowerCase() : "driving";

        try {
            return webClient.get()
                .uri(builder -> builder
                    .scheme("https")
                    .host("maps.googleapis.com")
                    .path("/maps/api/distancematrix/json")
                    .queryParam("origins", origin)
                    .queryParam("destinations", destination)
                    .queryParam("mode", travelMode)
                    .queryParam("departure_time", "now") // Fetch duration_in_traffic
                    .queryParam("key", mapsApiKey)
                    .build())
                .retrieve()
                .bodyToMono(Map.class)
                .block();
        } catch (Exception e) {
            e.printStackTrace();
            return Map.of("error", "Failed to interface with Maps Platform: " + e.getMessage());
        }
    }
}
