package com.assistant.maps;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class MapsService {

    private static final Logger log = LoggerFactory.getLogger(MapsService.class);
    @Value("${VITE_GOOGLE_MAPS_API_KEY:}")
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
            log.warn("Distance Matrix request failed for {} -> {}: {}", origin, destination, e.toString());
            return Map.of("error", "Failed to interface with Maps Platform: " + e.getMessage());
        }
    }

    /** A geocoded place: coordinates plus Google's canonical address. */
    public record GeoPoint(double latitude, double longitude, String formattedAddress) {}

    /**
     * Resolves a free-text address with the Geocoding API. Returns empty when no key is
     * configured, nothing matches or the call fails, so callers can degrade gracefully.
     */
    @SuppressWarnings("unchecked")
    public Optional<GeoPoint> geocode(String address) {
        if (mapsApiKey == null || mapsApiKey.isEmpty() || address == null || address.isBlank()) {
            return Optional.empty();
        }
        try {
            Map<String, Object> body = webClient.get()
                .uri(builder -> builder
                    .scheme("https")
                    .host("maps.googleapis.com")
                    .path("/maps/api/geocode/json")
                    .queryParam("address", address)
                    .queryParam("key", mapsApiKey)
                    .build())
                .retrieve()
                .bodyToMono(Map.class)
                .block();
            if (body == null || !"OK".equals(body.get("status"))) {
                log.debug("Geocoding '{}' returned status {}", address, body == null ? null : body.get("status"));
                return Optional.empty();
            }
            Map<String, Object> first = ((List<Map<String, Object>>) body.get("results")).get(0);
            Map<String, Object> location = (Map<String, Object>) ((Map<String, Object>) first.get("geometry")).get("location");
            return Optional.of(new GeoPoint(
                ((Number) location.get("lat")).doubleValue(),
                ((Number) location.get("lng")).doubleValue(),
                (String) first.getOrDefault("formatted_address", address)));
        } catch (Exception e) {
            log.warn("Geocoding request failed for {}: {}", address, e.toString());
            return Optional.empty();
        }
    }
}
