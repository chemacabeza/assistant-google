package com.assistant.photos;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PhotosController.class)
@DisplayName("PhotosController - /api/photos")
class PhotosControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private PhotosService photosService;

    @Test
    @DisplayName("POST /session creates a picker session (CSRF required)")
    void createSession() throws Exception {
        when(photosService.createPickerSession()).thenReturn(Map.of("id", "s1", "pickerUri", "https://photos/picker"));

        mockMvc.perform(post("/api/photos/session").with(user()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pickerUri").value("https://photos/picker"));

        mockMvc.perform(post("/api/photos/session").with(user())).andExpect(status().isForbidden());
        verify(photosService).createPickerSession();
    }

    @Test
    @DisplayName("GET /session/{id} returns the session status")
    void sessionStatus() throws Exception {
        when(photosService.getSessionStatus("s1")).thenReturn(Map.of("mediaItemsSet", true));

        mockMvc.perform(get("/api/photos/session/s1").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mediaItemsSet").value(true));
    }

    @Test
    @DisplayName("GET /media requires sessionId and defaults pageSize to 50")
    void media() throws Exception {
        when(photosService.listMediaItems("s1", 50)).thenReturn(Map.of("mediaItems", java.util.List.of()));

        mockMvc.perform(get("/api/photos/media").param("sessionId", "s1").with(user()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mediaItems").isArray());
        mockMvc.perform(get("/api/photos/media").with(user()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing required parameter 'sessionId'"));
    }

    @Test
    @DisplayName("Requires a session")
    void requiresAuth() throws Exception {
        mockMvc.perform(get("/api/photos/session/s1")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/photos/session").with(csrf())).andExpect(status().isUnauthorized());
        verifyNoInteractions(photosService);
    }
}
