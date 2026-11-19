package com.assistant.account;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

/** The signed-in user's linked accounts. The principal's name is the Google email. */
@RestController
@RequestMapping("/api/accounts")
public class LinkedAccountController {

    private final LinkedAccountService service;

    public LinkedAccountController(LinkedAccountService service) {
        this.service = service;
    }

    @GetMapping
    public List<LinkedAccount> getAccounts(Principal principal) {
        return service.getAccounts(principal.getName());
    }

    @PostMapping
    public ResponseEntity<?> addAccount(Principal principal, @RequestBody LinkedAccount account) {
        try {
            LinkedAccount saved = service.addAccount(principal.getName(), account);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccount(Principal principal, @PathVariable Long id) {
        return service.deleteAccount(principal.getName(), id)
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }
}
