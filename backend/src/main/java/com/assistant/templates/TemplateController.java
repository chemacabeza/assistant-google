package com.assistant.templates;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/templates")
public class TemplateController {

    private final TemplateService templateService;

    @GetMapping
    public ResponseEntity<?> getTemplates(@AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(templateService.getUserTemplates(user.getAttribute("email")));
    }

    @PostMapping
    public ResponseEntity<?> createTemplate(
            @AuthenticationPrincipal OAuth2User user,
            @RequestBody CustomAnswerTemplate template) {
        return ResponseEntity.ok(templateService.createTemplate(user.getAttribute("email"), template));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateTemplate(
            @AuthenticationPrincipal OAuth2User user,
            @PathVariable Long id,
            @RequestBody CustomAnswerTemplate template) {
        return ResponseEntity.ok(templateService.updateTemplate(user.getAttribute("email"), id, template));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTemplate(
            @AuthenticationPrincipal OAuth2User user,
            @PathVariable Long id) {
        templateService.deleteTemplate(user.getAttribute("email"), id);
        return ResponseEntity.ok().build();
    }

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }
}
