package com.assistant.account;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/accounts")
public class LinkedAccountController {

    private final LinkedAccountService service;

    public LinkedAccountController(LinkedAccountService service) {
        this.service = service;
    }

    @GetMapping
    public List<LinkedAccount> getAllAccounts() {
        return service.getAllAccounts();
    }

    @PostMapping
    public ResponseEntity<?> addAccount(@RequestBody LinkedAccount account) {
        try {
            LinkedAccount saved = service.addAccount(account);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccount(@PathVariable Long id) {
        service.deleteAccount(id);
        return ResponseEntity.ok().build();
    }
}
