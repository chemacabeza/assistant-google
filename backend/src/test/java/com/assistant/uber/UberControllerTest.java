package com.assistant.uber;

import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UberController.class)
@DisplayName("UberController - /api/uber")
class UberControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private UberService uberService;

    @Test
    @DisplayName("GET /ride-link returns the deep link for the given trip")
    void rideLink() throws Exception {
        when(uberService.buildRideLink("Home", "Office", "Work"))
                .thenReturn(new UberService.RideLink("https://m.uber.com/ul/?action=setPickup", "Home", "Office", true, true));

        mockMvc.perform(get("/api/uber/ride-link")
                        .param("pickup", "Home").param("dropoff", "Office").param("nickname", "Work").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value("https://m.uber.com/ul/?action=setPickup"))
                .andExpect(jsonPath("$.dropoff").value("Office"))
                .andExpect(jsonPath("$.dropoffGeocoded").value(true));
    }

    @Test
    @DisplayName("GET /ride-link without dropoff answers 400")
    void missingDropoff() throws Exception {
        mockMvc.perform(get("/api/uber/ride-link").with(user()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing required parameter 'dropoff'"));
        verifyNoInteractions(uberService);
    }

    @Test
    @DisplayName("GET /ride-link requires authentication")
    void requiresAuth() throws Exception {
        mockMvc.perform(get("/api/uber/ride-link").param("dropoff", "Office"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(uberService);
    }
}
