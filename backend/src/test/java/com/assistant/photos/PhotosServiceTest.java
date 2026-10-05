package com.assistant.photos;

import com.assistant.testsupport.StubExchangeFunction;
import com.assistant.testsupport.StubExchangeFunction.RecordedRequest;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("PhotosService - Google Photos Picker calls")
class PhotosServiceTest {

    private StubExchangeFunction http;
    private PhotosService photosService;

    @BeforeEach
    void setUp() {
        http = new StubExchangeFunction();
        photosService = new PhotosService(http.webClient());
    }

    @Test
    @DisplayName("createPickerSession POSTs an empty JSON object to /sessions")
    void createPickerSession() {
        http.enqueueJson("{\"id\":\"s1\",\"pickerUri\":\"https://photos.google.com/picker/s1\"}");

        Object result = photosService.createPickerSession();

        RecordedRequest request = http.lastRequest();
        assertThat(request.method()).isEqualTo(HttpMethod.POST);
        assertThat(request.uri().toString()).isEqualTo("https://photospicker.googleapis.com/v1/sessions");
        assertThat(request.body()).isEqualTo("{}");
        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP).containsEntry("id", "s1");
    }

    @Test
    @DisplayName("getSessionStatus GETs the session by id")
    void getSessionStatus() {
        http.enqueueJson("{\"id\":\"s1\",\"mediaItemsSet\":true}");

        Object result = photosService.getSessionStatus("s1");

        assertThat(http.lastRequest().method()).isEqualTo(HttpMethod.GET);
        assertThat(http.lastRequest().uri().toString()).isEqualTo("https://photospicker.googleapis.com/v1/sessions/s1");
        assertThat(result).asInstanceOf(InstanceOfAssertFactories.MAP).containsEntry("mediaItemsSet", true);
    }

    @Test
    @DisplayName("listMediaItems passes sessionId and pageSize")
    void listMediaItems() {
        http.enqueueJson("{\"mediaItems\":[]}");

        photosService.listMediaItems("s1", 25);

        RecordedRequest request = http.lastRequest();
        assertThat(request.uri().getPath()).isEqualTo("/v1/mediaItems");
        assertThat(request.queryParam("sessionId")).isEqualTo("s1");
        assertThat(request.queryParam("pageSize")).isEqualTo("25");
    }

    @Test
    @DisplayName("Upstream errors propagate")
    void upstreamError() {
        http.enqueue(HttpStatus.BAD_REQUEST, "{}");

        assertThatThrownBy(() -> photosService.getSessionStatus("bad"))
                .isInstanceOf(WebClientResponseException.BadRequest.class);
    }
}
