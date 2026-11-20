package com.assistant.uber;

import com.assistant.maps.MapsService;
import com.assistant.maps.MapsService.GeoPoint;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("UberService - universal ride links")
class UberServiceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock private MapsService mapsService;
    @InjectMocks private UberService uberService;

    private static final GeoPoint HBF = new GeoPoint(52.5250831, 13.369389, "Hauptbahnhof, Europaplatz 1, 10557 Berlin", "Hauptbahnhof");
    private static final GeoPoint ALEX = new GeoPoint(52.5219, 13.4132, "Alexanderplatz, 10178 Berlin", null);

    /** Decoded value of a query parameter of the generated link, or {@code null}. */
    private static String param(String url, String name) {
        String query = URI.create(url).getRawQuery();
        if (query == null) return null;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (URLDecoder.decode(kv[0], StandardCharsets.UTF_8).equals(name)) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static Map<String, Object> location(String url, String name) throws Exception {
        return JSON.readValue(param(url, name), new TypeReference<>() {});
    }

    @Test
    @DisplayName("Without a pickup only drop[0] is set, so Uber uses the rider's location")
    void currentLocationPickup() throws Exception {
        when(mapsService.geocode("Berlin Hbf")).thenReturn(Optional.of(HBF));

        UberService.RideLink link = uberService.buildRideLink(null, " Berlin Hbf ", "Station");

        assertThat(link.url()).startsWith("https://m.uber.com/looking?drop%5B0%5D=");
        assertThat(param(link.url(), "pickup")).isNull();
        assertThat(location(link.url(), "drop[0]")).containsExactly(
                Map.entry("latitude", 52.5250831),
                Map.entry("longitude", 13.369389),
                Map.entry("addressLine1", "Station"), // the nickname wins over Google's name
                Map.entry("addressLine2", "Hauptbahnhof, Europaplatz 1, 10557 Berlin"));
        assertThat(link.pickup()).isEqualTo("Current location");
        assertThat(link.dropoff()).isEqualTo("Hauptbahnhof, Europaplatz 1, 10557 Berlin");
        assertThat(link.pickupGeocoded()).isFalse();
        assertThat(link.dropoffGeocoded()).isTrue();
        verify(mapsService).geocode("Berlin Hbf");
    }

    @Test
    @DisplayName("A named pickup becomes the pickup location; names fall back to Google's, then to the typed text")
    void explicitPickup() throws Exception {
        when(mapsService.geocode("Alex & Co")).thenReturn(Optional.of(ALEX));
        when(mapsService.geocode("Berlin Hbf")).thenReturn(Optional.of(HBF));

        UberService.RideLink link = uberService.buildRideLink("Alex & Co", "Berlin Hbf", null);

        assertThat(link.url()).startsWith("https://m.uber.com/looking?pickup=").doesNotContain(" ").doesNotContain("{");
        assertThat(location(link.url(), "pickup"))
                .containsEntry("latitude", 52.5219)
                .containsEntry("addressLine1", "Alex & Co") // Google gave no name
                .containsEntry("addressLine2", "Alexanderplatz, 10178 Berlin");
        assertThat(location(link.url(), "drop[0]")).containsEntry("addressLine1", "Hauptbahnhof");
        assertThat(link.pickupGeocoded()).isTrue();
    }

    @Test
    @DisplayName("Places that cannot be located are left out of the link and flagged")
    void notGeocoded() {
        when(mapsService.geocode(anyString())).thenReturn(Optional.empty());

        UberService.RideLink link = uberService.buildRideLink("Home street 1", "Office road 2", null);

        assertThat(link.url()).isEqualTo("https://m.uber.com/looking");
        assertThat(link.pickup()).isEqualTo("Home street 1");
        assertThat(link.dropoff()).isEqualTo("Office road 2");
        assertThat(link.pickupGeocoded()).isFalse();
        assertThat(link.dropoffGeocoded()).isFalse();
    }

    @Test
    @DisplayName("Recognises current-location phrases in English and Spanish")
    void currentLocationAliases() {
        assertThat(UberService.isCurrentLocation(null)).isTrue();
        assertThat(UberService.isCurrentLocation("  ")).isTrue();
        assertThat(UberService.isCurrentLocation("Current Location")).isTrue();
        assertThat(UberService.isCurrentLocation("mi ubicación")).isTrue();
        assertThat(UberService.isCurrentLocation("Main St 1")).isFalse();
    }

    @Test
    @DisplayName("Rejects a missing drop-off without calling Maps")
    void missingDropoff() {
        assertThatThrownBy(() -> uberService.buildRideLink(null, " ", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("A drop-off address is required");
        verifyNoInteractions(mapsService);
    }
}
