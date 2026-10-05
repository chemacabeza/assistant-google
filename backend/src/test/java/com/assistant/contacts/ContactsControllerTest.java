package com.assistant.contacts;

import com.assistant.contacts.ContactsService.ContactDto;
import com.assistant.testsupport.WebMvcSecurityTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ContactsController.class)
@DisplayName("ContactsController - /api/contacts")
class ContactsControllerTest extends WebMvcSecurityTest {

    @MockitoBean
    private ContactsService contactsService;

    @Test
    @DisplayName("GET returns contacts as {name, email} objects")
    void listContacts() throws Exception {
        when(contactsService.fetchGoogleContacts()).thenReturn(List.of(new ContactDto("Ada", "ada@example.com")));

        mockMvc.perform(get("/api/contacts").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Ada"))
                .andExpect(jsonPath("$[0].email").value("ada@example.com"));
    }

    @Test
    @DisplayName("GET answers 500 with a generic message when no contacts could be loaded")
    void listContactsFailure() throws Exception {
        when(contactsService.fetchGoogleContacts()).thenThrow(new RuntimeException("Could not load any contacts"));

        mockMvc.perform(get("/api/contacts").with(user()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Internal server error"));
    }

    @Test
    @DisplayName("GET /search forwards q")
    void search() throws Exception {
        when(contactsService.searchPeople("Ada")).thenReturn(List.of(new ContactDto("Ada", "ada@example.com")));

        mockMvc.perform(get("/api/contacts/search").param("q", "Ada").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].email").value("ada@example.com"));
    }

    @Test
    @DisplayName("GET /search without q answers 400")
    void searchMissingQuery() throws Exception {
        mockMvc.perform(get("/api/contacts/search").with(user()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing required parameter 'q'"));
        verifyNoInteractions(contactsService);
    }

    @Test
    @DisplayName("Requires a session")
    void requiresAuth() throws Exception {
        mockMvc.perform(get("/api/contacts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/contacts/search").param("q", "x")).andExpect(status().isUnauthorized());
    }
}
