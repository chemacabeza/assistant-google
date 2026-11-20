package com.assistant.uber;

import com.assistant.maps.MapsService;
import com.assistant.maps.MapsService.GeoPoint;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Builds Uber universal ride links, in the format Uber documents for deep links:
 * {@code https://m.uber.com/looking?pickup=<Location JSON>&drop[0]=<Location JSON>}, where a
 * Location is {@code {"latitude", "longitude", "addressLine1", "addressLine2"}}.
 *
 * Uber's ride-request API is restricted to approved partners, so instead of booking the ride
 * ourselves we hand the user a link that opens Uber with the trip filled in; the user confirms
 * the ride there. Uber only places a location that has coordinates, so addresses are resolved
 * through Google Maps first. Without a pickup Uber uses (or asks for) the rider's location.
 */
@Service
public class UberService {

    static final String BASE_URL = "https://m.uber.com/looking";

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final Set<String> CURRENT_LOCATION_ALIASES = Set.of(
            "", "my_location", "my location", "current location", "my current location", "here",
            "mi ubicación", "mi ubicacion", "ubicación actual", "ubicacion actual", "aquí", "aqui");

    private final MapsService mapsService;

    public UberService(MapsService mapsService) {
        this.mapsService = mapsService;
    }

    /**
     * Link details returned to the UI and the assistant. A location that could not be resolved
     * to coordinates is left out of the link (Uber would ignore it) and flagged as not geocoded,
     * so the rider enters it in Uber.
     */
    public record RideLink(String url, String pickup, String dropoff, boolean pickupGeocoded, boolean dropoffGeocoded) {}

    /**
     * @param pickup   pickup address; blank (or "current location") lets Uber use the rider's location
     * @param dropoff  destination address or place name (required)
     * @param nickname optional label shown by Uber for the destination (e.g. "Office")
     */
    public RideLink buildRideLink(String pickup, String dropoff, String nickname) {
        if (dropoff == null || dropoff.isBlank()) {
            throw new IllegalArgumentException("A drop-off address is required");
        }

        Map<String, String> params = new LinkedHashMap<>();

        String pickupLabel = "Current location";
        boolean pickupGeocoded = false;
        if (!isCurrentLocation(pickup)) {
            Optional<GeoPoint> point = mapsService.geocode(pickup.trim());
            pickupGeocoded = point.isPresent();
            pickupLabel = point.map(GeoPoint::formattedAddress).orElse(pickup.trim());
            point.ifPresent(p -> params.put("pickup", location(p, null, pickup.trim())));
        }

        Optional<GeoPoint> dropoffPoint = mapsService.geocode(dropoff.trim());
        String dropoffLabel = dropoffPoint.map(GeoPoint::formattedAddress).orElse(dropoff.trim());
        dropoffPoint.ifPresent(p -> params.put("drop[0]", location(p, nickname, dropoff.trim())));

        return new RideLink(toUrl(params), pickupLabel, dropoffLabel, pickupGeocoded, dropoffPoint.isPresent());
    }

    /** Uber Location JSON: addressLine1 is the short name, addressLine2 the full address. */
    private static String location(GeoPoint point, String nickname, String typed) {
        Map<String, Object> loc = new LinkedHashMap<>();
        loc.put("latitude", point.latitude());
        loc.put("longitude", point.longitude());
        String name = firstNonBlank(nickname, point.name(), typed);
        loc.put("addressLine1", name);
        loc.put("addressLine2", point.formattedAddress());
        try {
            return JSON.writeValueAsString(loc);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise Uber location", e);
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return "";
    }

    static boolean isCurrentLocation(String pickup) {
        return pickup == null || CURRENT_LOCATION_ALIASES.contains(pickup.trim().toLowerCase(Locale.ROOT));
    }

    private static String toUrl(Map<String, String> params) {
        if (params.isEmpty()) return BASE_URL;
        StringBuilder url = new StringBuilder(BASE_URL).append('?');
        params.forEach((k, v) -> {
            if (url.charAt(url.length() - 1) != '?') url.append('&');
            url.append(URLEncoder.encode(k, StandardCharsets.UTF_8).replace("+", "%20"))
               .append('=')
               .append(URLEncoder.encode(v, StandardCharsets.UTF_8).replace("+", "%20"));
        });
        return url.toString();
    }
}
