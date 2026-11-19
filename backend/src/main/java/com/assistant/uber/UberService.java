package com.assistant.uber;

import com.assistant.maps.MapsService;
import com.assistant.maps.MapsService.GeoPoint;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Builds Uber "universal" deep links (https://m.uber.com/ul/?action=setPickup...).
 *
 * Uber's ride-request API is restricted to approved partners, so instead of booking the
 * ride ourselves we hand the user a link that opens the Uber app (or m.uber.com) with the
 * pickup and drop-off already filled in; the user confirms the ride there. Addresses are
 * geocoded through Google Maps because Uber needs coordinates to place the pins; when
 * geocoding is unavailable the link still carries the address text.
 */
@Service
public class UberService {

    static final String BASE_URL = "https://m.uber.com/ul/";

    private static final Set<String> CURRENT_LOCATION_ALIASES = Set.of(
            "", "my_location", "my location", "current location", "my current location", "here",
            "mi ubicación", "mi ubicacion", "ubicación actual", "ubicacion actual", "aquí", "aqui");

    private final MapsService mapsService;

    public UberService(MapsService mapsService) {
        this.mapsService = mapsService;
    }

    /** Link details returned to the UI and the assistant. */
    public record RideLink(String url, String pickup, String dropoff, boolean pickupGeocoded, boolean dropoffGeocoded) {}

    /**
     * @param pickup   pickup address; blank (or "current location") lets Uber use the device location
     * @param dropoff  destination address (required)
     * @param nickname optional label shown by Uber for the destination (e.g. "Office")
     */
    public RideLink buildRideLink(String pickup, String dropoff, String nickname) {
        if (dropoff == null || dropoff.isBlank()) {
            throw new IllegalArgumentException("A drop-off address is required");
        }

        Map<String, String> params = new LinkedHashMap<>();
        params.put("action", "setPickup");

        String pickupLabel;
        boolean pickupGeocoded = false;
        if (isCurrentLocation(pickup)) {
            params.put("pickup", "my_location");
            pickupLabel = "Current location";
        } else {
            Optional<GeoPoint> point = mapsService.geocode(pickup.trim());
            pickupGeocoded = point.isPresent();
            pickupLabel = addPlace(params, "pickup", pickup.trim(), point, null);
        }

        Optional<GeoPoint> dropoffPoint = mapsService.geocode(dropoff.trim());
        String dropoffLabel = addPlace(params, "dropoff", dropoff.trim(), dropoffPoint, nickname);

        return new RideLink(toUrl(params), pickupLabel, dropoffLabel, pickupGeocoded, dropoffPoint.isPresent());
    }

    private static String addPlace(Map<String, String> params, String key, String address,
                                   Optional<GeoPoint> point, String nickname) {
        String label = point.map(GeoPoint::formattedAddress).orElse(address);
        point.ifPresent(p -> {
            params.put(key + "[latitude]", String.valueOf(p.latitude()));
            params.put(key + "[longitude]", String.valueOf(p.longitude()));
        });
        params.put(key + "[formatted_address]", label);
        if (nickname != null && !nickname.isBlank()) {
            params.put(key + "[nickname]", nickname.trim());
        }
        return label;
    }

    static boolean isCurrentLocation(String pickup) {
        return pickup == null || CURRENT_LOCATION_ALIASES.contains(pickup.trim().toLowerCase(Locale.ROOT));
    }

    private static String toUrl(Map<String, String> params) {
        StringBuilder url = new StringBuilder(BASE_URL).append('?');
        params.forEach((k, v) -> {
            if (url.charAt(url.length() - 1) != '?') url.append('&');
            url.append(URLEncoder.encode(k, StandardCharsets.UTF_8))
               .append('=')
               .append(URLEncoder.encode(v, StandardCharsets.UTF_8));
        });
        return url.toString();
    }
}
