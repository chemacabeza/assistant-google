package com.assistant.maps;

import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.testsupport.StubExchangeFunction.RecordedRequest;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("MapsService - Distance Matrix calls")
class MapsServiceTest {

    private StubExchangeFunction http;
    private MapsService mapsService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        mapsService = new MapsService(http.webClientBuilder());
        ReflectionTestUtils.setField(mapsService, "mapsApiKey", "maps-key");
    }

    @Test
    @DisplayName("Without an API key it returns an error map and makes no HTTP call")
    void missingApiKey() {
        ReflectionTestUtils.setField(mapsService, "mapsApiKey", "");

        Object result = mapsService.calculateTravelDuration("A", "B", "driving");

        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP)
                .containsEntry("error", "Maps API Key is not bound to server layer.");
        assertThat(http.requests()).isEmpty();
    }

    @Test
    @DisplayName("Builds the Distance Matrix URL with encoded origins/destinations, mode, departure_time and key")
    void buildsDistanceMatrixRequest() {
        http.enqueueJson("{\"status\":\"OK\",\"rows\":[]}");

        Object result = mapsService.calculateTravelDuration("Alexanderplatz, Berlin", "Flughafen BER & Terminal 1", "TRANSIT");

        RecordedRequest request = http.lastRequest();
        assertThat(request.uri().getScheme()).isEqualTo("https");
        assertThat(request.uri().getHost()).isEqualTo("maps.googleapis.com");
        assertThat(request.uri().getPath()).isEqualTo("/maps/api/distancematrix/json");
        assertThat(request.queryParam("origins")).isEqualTo("Alexanderplatz, Berlin");
        assertThat(request.queryParam("destinations")).isEqualTo("Flughafen BER & Terminal 1");
        assertThat(request.queryParam("mode")).isEqualTo("transit");
        assertThat(request.queryParam("departure_time")).isEqualTo("now");
        assertThat(request.queryParam("key")).isEqualTo("maps-key");
        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP).containsEntry("status", "OK");
    }

    @Test
    @DisplayName("Defaults the travel mode to driving when none is given")
    void defaultsToDriving() {
        http.enqueueJson("{}");
        http.enqueueJson("{}");

        mapsService.calculateTravelDuration("A", "B", null);
        assertThat(http.lastRequest().queryParam("mode")).isEqualTo("driving");

        mapsService.calculateTravelDuration("A", "B", "");
        assertThat(http.lastRequest().queryParam("mode")).isEqualTo("driving");
    }

    @Test
    @DisplayName("Upstream failures are converted into an error map instead of throwing")
    void upstreamFailure() {
        http.enqueue(HttpStatus.SERVICE_UNAVAILABLE, "{}");

        Object result = mapsService.calculateTravelDuration("A", "B", "walking");

        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP)
                .hasEntrySatisfying("error", e -> assertThat((String) e).startsWith("Failed to interface with Maps Platform:"));
    }

    @Test
    @DisplayName("geocode returns coordinates and the formatted address of the first result")
    void geocodeSuccess() {
        http.enqueueJson("""
                {"status":"OK","results":[{"formatted_address":"Alexanderplatz, 10178 Berlin, Germany",
                  "geometry":{"location":{"lat":52.5219,"lng":13.4132}}}]}
                """);

        var point = mapsService.geocode("Alexanderplatz & more");

        assertThat(http.lastRequest().uri().getPath()).isEqualTo("/maps/api/geocode/json");
        assertThat(http.lastRequest().queryParam("address")).isEqualTo("Alexanderplatz & more");
        assertThat(http.lastRequest().queryParam("key")).isEqualTo("maps-key");
        assertThat(point).contains(new MapsService.GeoPoint(52.5219, 13.4132, "Alexanderplatz, 10178 Berlin, Germany"));
    }

    @Test
    @DisplayName("geocode is empty for ZERO_RESULTS, upstream errors, blank input or a missing key")
    void geocodeEmpty() {
        http.enqueueJson("{\"status\":\"ZERO_RESULTS\",\"results\":[]}");
        assertThat(mapsService.geocode("nowhere")).isEmpty();

        http.enqueue(HttpStatus.SERVICE_UNAVAILABLE, "{}");
        assertThat(mapsService.geocode("somewhere")).isEmpty();

        assertThat(mapsService.geocode(" ")).isEmpty();
        ReflectionTestUtils.setField(mapsService, "mapsApiKey", "");
        assertThat(mapsService.geocode("somewhere")).isEmpty();
        assertThat(http.requests()).hasSize(2);
    }
}
