package com.assistant.photos;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import com.assistant.audit.Auditable;

@Service
public class PhotosService {

    private final WebClient webClient;
    private static final String PHOTOS_LIBRARY_URL = "https://photoslibrary.googleapis.com/v1";

    public PhotosService(WebClient webClient) {
        this.webClient = webClient;
    }

    /**
     * Lists media items from Google Photos Library
     */
    @Auditable(actionType = "PHOTOS_LIST_MEDIA")
    public Object listMediaItems(int pageSize) {
        return webClient.get()
                .uri(PHOTOS_LIBRARY_URL + "/mediaItems?pageSize=" + pageSize)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }
}
