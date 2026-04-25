package com.assistant.drive;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import com.assistant.audit.Auditable;

import java.util.Map;

@Service
public class DriveService {

    private final WebClient webClient;
    private static final String DRIVE_BASE_URL = "https://www.googleapis.com/drive/v3";
    private static final String DRIVE_ACTIVITY_URL = "https://driveactivity.googleapis.com/v2";
    private static final String DRIVE_LABELS_URL = "https://drivelabels.googleapis.com/v2";

    public DriveService(WebClient webClient) {
        this.webClient = webClient;
    }

    /**
     * Lists files from Google Drive
     */
    @Auditable(actionType = "DRIVE_LIST_FILES")
    public Object listFiles(String query, int maxResults) {
        String finalUrl = DRIVE_BASE_URL + "/files?pageSize=" + maxResults;
        finalUrl += "&fields=files(id,name,mimeType,owners/displayName,owners/photoLink,owners/me,modifiedTime,size)";
        finalUrl += "&orderBy=folder,name";
        if (query != null && !query.isEmpty()) {
            finalUrl += "&q=" + query;
        }

        return webClient.get()
                .uri(finalUrl)
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Get Drive Activity for a specific file
     */
    @Auditable(actionType = "DRIVE_GET_ACTIVITY")
    public Object getFileActivity(String fileId) {
        return webClient.post()
                .uri(DRIVE_ACTIVITY_URL + "/activity:query")
                .bodyValue(Map.of("itemName", "items/" + fileId))
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }

    /**
     * Lists labels available in Google Drive
     */
    @Auditable(actionType = "DRIVE_LIST_LABELS")
    public Object listLabels() {
        return webClient.get()
                .uri(DRIVE_LABELS_URL + "/labels")
                .retrieve()
                .bodyToMono(Object.class)
                .block();
    }
}
