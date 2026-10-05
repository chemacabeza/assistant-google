package com.assistant.drive;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.reactive.function.client.WebClientRequestException;

import java.net.URI;
import java.util.Map;

import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DriveController.class)
@DisplayName("DriveController - /api/drive")
class DriveControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private DriveService driveService;

    @Test
    @DisplayName("GET /files defaults to 15 results and no query")
    void listFilesDefaults() throws Exception {
        when(driveService.listFiles(null, 15)).thenReturn(Map.of("files", java.util.List.of(Map.of("name", "Doc"))));

        mockMvc.perform(get("/api/drive/files").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files[0].name").value("Doc"));
        verify(driveService).listFiles(isNull(), org.mockito.ArgumentMatchers.eq(15));
    }

    @Test
    @DisplayName("GET /files forwards q and maxResults")
    void listFilesWithParams() throws Exception {
        when(driveService.listFiles("name contains 'x'", 3)).thenReturn(Map.of());

        mockMvc.perform(get("/api/drive/files").param("q", "name contains 'x'").param("maxResults", "3").with(user()))
                .andExpect(status().isOk());
        verify(driveService).listFiles("name contains 'x'", 3);
    }

    @Test
    @DisplayName("GET /files/{id}/activity and /labels delegate to the service")
    void activityAndLabels() throws Exception {
        when(driveService.getFileActivity("f1")).thenReturn(Map.of("activities", java.util.List.of()));
        when(driveService.listLabels()).thenReturn(Map.of("labels", java.util.List.of(Map.of("id", "l1"))));

        mockMvc.perform(get("/api/drive/files/f1/activity").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.activities").isArray());
        mockMvc.perform(get("/api/drive/labels").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.labels[0].id").value("l1"));
    }

    @Test
    @DisplayName("An unreachable Google API answers 502")
    void unreachableUpstream() throws Exception {
        when(driveService.listLabels()).thenThrow(new WebClientRequestException(new java.net.ConnectException("refused"),
                org.springframework.http.HttpMethod.GET, URI.create("https://drivelabels.googleapis.com/v2/labels"),
                org.springframework.http.HttpHeaders.EMPTY));

        mockMvc.perform(get("/api/drive/labels").with(user()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Upstream service is unreachable"));
    }

    @Test
    @DisplayName("Requires a session")
    void requiresAuth() throws Exception {
        mockMvc.perform(get("/api/drive/files")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/drive/labels")).andExpect(status().isUnauthorized());
    }
}
