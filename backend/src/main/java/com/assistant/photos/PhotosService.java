package com.assistant.photos;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import com.assistant.audit.Auditable;
import java.util.Map;

@Service
public class PhotosService {

    private final WebClient webClient;
    private static final String PHOTOS_PICKER_URL = "https://photospicker.googleapis.com/v1";

    public PhotosService(WebClient webClient) {
        this.webClient = webClient;
    }

    /**
     * Creates a new Google Photos Picker Session
     */
    @Auditable(actionType = "PHOTOS_CREATE_SESSION")
    public Object createPickerSession() {
        return webClient.post()
                .uri(PHOTOS_PICKER_URL + "/sessions")
                .bodyValue(Map.of()) // Google expects the PickingSession object directly, so an empty object is fine
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Gets the status of an active Picker Session
     */
    public Object getSessionStatus(String sessionId) {
        return webClient.get()
                .uri(PHOTOS_PICKER_URL + "/sessions/" + sessionId)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Lists media items selected by the user in the Picker Session
     */
    @Auditable(actionType = "PHOTOS_LIST_MEDIA")
    public Object listMediaItems(String sessionId, int pageSize) {
        return webClient.get()
                .uri(PHOTOS_PICKER_URL + "/mediaItems?sessionId=" + sessionId + "&pageSize=" + pageSize)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }
}
