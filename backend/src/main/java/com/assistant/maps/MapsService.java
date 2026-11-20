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

    /**
     * A resolved place: coordinates, Google's canonical address and, when Google knows one,
     * the place's own name (e.g. "Hauptbahnhof"); {@code name} may be null.
     */
    public record GeoPoint(double latitude, double longitude, String formattedAddress, String name) {}

    /**
     * Resolves free text (an address or a place name) to coordinates. Tries the Geocoding API
     * first and falls back to Places "Find Place from Text", which also understands place
     * names and works for keys that only have the Places API enabled. Returns empty when no
     * key is configured, nothing matches or both calls fail, so callers can degrade gracefully.
     */
    public Optional<GeoPoint> geocode(String address) {
        if (mapsApiKey == null || mapsApiKey.isEmpty() || address == null || address.isBlank()) {
            return Optional.empty();
        }
        return geocodeAddress(address).or(() -> findPlace(address));
    }

    @SuppressWarnings("unchecked")
    private Optional<GeoPoint> geocodeAddress(String address) {
        Map<String, Object> body = get("/maps/api/geocode/json", Map.of("address", address));
        if (body == null || !"OK".equals(body.get("status"))) {
            log.debug("Geocoding '{}' returned {}: {}", address, body == null ? null : body.get("status"),
                body == null ? null : body.get("error_message"));
            return Optional.empty();
        }
        Map<String, Object> first = ((List<Map<String, Object>>) body.get("results")).get(0);
        return toPoint(first, address, null);
    }

    @SuppressWarnings("unchecked")
    private Optional<GeoPoint> findPlace(String text) {
        Map<String, Object> body = get("/maps/api/place/findplacefromtext/json", Map.of(
            "input", text,
            "inputtype", "textquery",
            "fields", "name,formatted_address,geometry"));
        if (body == null || !"OK".equals(body.get("status"))) {
            log.debug("Find Place '{}' returned {}: {}", text, body == null ? null : body.get("status"),
                body == null ? null : body.get("error_message"));
            return Optional.empty();
        }
        Map<String, Object> first = ((List<Map<String, Object>>) body.get("candidates")).get(0);
        return toPoint(first, text, (String) first.get("name"));
    }

    @SuppressWarnings("unchecked")
    private static Optional<GeoPoint> toPoint(Map<String, Object> result, String fallbackAddress, String name) {
        Map<String, Object> geometry = (Map<String, Object>) result.get("geometry");
        Map<String, Object> location = geometry == null ? null : (Map<String, Object>) geometry.get("location");
        if (location == null) return Optional.empty();
        return Optional.of(new GeoPoint(
            ((Number) location.get("lat")).doubleValue(),
            ((Number) location.get("lng")).doubleValue(),
            (String) result.getOrDefault("formatted_address", fallbackAddress),
            name));
    }

    /** GET on maps.googleapis.com with the key added; null when the call fails. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> get(String path, Map<String, String> params) {
        try {
            return webClient.get()
                .uri(builder -> {
                    builder.scheme("https").host("maps.googleapis.com").path(path);
                    params.forEach(builder::queryParam);
                    return builder.queryParam("key", mapsApiKey).build();
                })
                .retrieve()
                .bodyToMono(Map.class)
                .block();
        } catch (Exception e) {
            log.warn("Maps request {} failed: {}", path, e.toString());
            return null;
        }
    }
}
