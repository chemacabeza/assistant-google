package com.assistant.uber;

import com.assistant.maps.MapsService;
import com.assistant.maps.MapsService.GeoPoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("UberService - deep link builder")
class UberServiceTest {

    @Mock private MapsService mapsService;
    @InjectMocks private UberService uberService;

    /** Decoded value of a query parameter of the generated link, or {@code null}. */
    private static String param(String url, String name) {
        for (String pair : URI.create(url).getRawQuery().split("&")) {
            String[] kv = pair.split("=", 2);
            if (URLDecoder.decode(kv[0], StandardCharsets.UTF_8).equals(name)) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    @Test
    @DisplayName("Without a pickup it uses my_location and geocodes the drop-off")
    void currentLocationPickup() {
        when(mapsService.geocode("Berlin Hbf")).thenReturn(Optional.of(new GeoPoint(52.525, 13.369, "Berlin Hauptbahnhof, Berlin")));

        UberService.RideLink link = uberService.buildRideLink(null, " Berlin Hbf ", "Station");

        assertThat(link.url()).startsWith("https://m.uber.com/ul/?action=setPickup&");
        assertThat(param(link.url(), "pickup")).isEqualTo("my_location");
        assertThat(param(link.url(), "dropoff[latitude]")).isEqualTo("52.525");
        assertThat(param(link.url(), "dropoff[longitude]")).isEqualTo("13.369");
        assertThat(param(link.url(), "dropoff[formatted_address]")).isEqualTo("Berlin Hauptbahnhof, Berlin");
        assertThat(param(link.url(), "dropoff[nickname]")).isEqualTo("Station");
        assertThat(link.pickup()).isEqualTo("Current location");
        assertThat(link.dropoff()).isEqualTo("Berlin Hauptbahnhof, Berlin");
        assertThat(link.pickupGeocoded()).isFalse();
        assertThat(link.dropoffGeocoded()).isTrue();
        verify(mapsService).geocode("Berlin Hbf");
    }

    @Test
    @DisplayName("Geocodes an explicit pickup and URL-encodes special characters")
    void explicitPickup() {
        when(mapsService.geocode("Rue de l'Église & 5")).thenReturn(Optional.of(new GeoPoint(48.8, 2.3, "Rue de l'Église 5, Paris")));
        when(mapsService.geocode("Orly")).thenReturn(Optional.of(new GeoPoint(48.72, 2.38, "Orly Airport")));

        UberService.RideLink link = uberService.buildRideLink("Rue de l'Église & 5", "Orly", null);

        assertThat(link.url()).doesNotContain(" ").doesNotContain("[");
        assertThat(param(link.url(), "pickup")).isNull();
        assertThat(param(link.url(), "pickup[latitude]")).isEqualTo("48.8");
        assertThat(param(link.url(), "pickup[formatted_address]")).isEqualTo("Rue de l'Église 5, Paris");
        assertThat(param(link.url(), "dropoff[nickname]")).isNull();
        assertThat(link.pickupGeocoded()).isTrue();
    }

    @Test
    @DisplayName("Falls back to the raw address when geocoding is unavailable")
    void geocodingUnavailable() {
        when(mapsService.geocode(anyString())).thenReturn(Optional.empty());

        UberService.RideLink link = uberService.buildRideLink("Home street 1", "Office road 2", null);

        assertThat(param(link.url(), "pickup[formatted_address]")).isEqualTo("Home street 1");
        assertThat(param(link.url(), "dropoff[formatted_address]")).isEqualTo("Office road 2");
        assertThat(param(link.url(), "dropoff[latitude]")).isNull();
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
