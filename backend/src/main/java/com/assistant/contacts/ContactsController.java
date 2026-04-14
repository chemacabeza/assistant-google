package com.assistant.contacts;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/contacts")
public class ContactsController {

    private final ContactsService contactsService;

    public ContactsController(ContactsService contactsService) {
        this.contactsService = contactsService;
    }

    @GetMapping
    public ResponseEntity<List<ContactsService.ContactDto>> getContacts() {
        return ResponseEntity.ok(contactsService.fetchGoogleContacts());
    }

    @GetMapping("/search")
    public ResponseEntity<List<ContactsService.ContactDto>> searchContacts(@org.springframework.web.bind.annotation.RequestParam String q) {
        return ResponseEntity.ok(contactsService.searchPeople(q));
    }
}
