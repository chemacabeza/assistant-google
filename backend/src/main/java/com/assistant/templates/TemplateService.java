package com.assistant.templates;

import com.assistant.auth.User;
import com.assistant.auth.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class TemplateService {

    private final CustomAnswerTemplateRepository templateRepository;
    private final UserRepository userRepository;

    public List<CustomAnswerTemplate> getUserTemplates(String email) {
        return templateRepository.findByUserEmailOrderByCreatedAtDesc(email);
    }

    public CustomAnswerTemplate createTemplate(String email, CustomAnswerTemplate templateData) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        
        templateData.setUser(user);
        return templateRepository.save(templateData);
    }

    public CustomAnswerTemplate updateTemplate(String email, Long id, CustomAnswerTemplate updatedData) {
        CustomAnswerTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found"));

        if (!existing.getUser().getEmail().equals(email)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not allowed to update this template");
        }

        existing.setTitle(updatedData.getTitle());
        existing.setContent(updatedData.getContent());
        existing.setCategory(updatedData.getCategory());
        existing.setFromEmail(updatedData.getFromEmail());
        existing.setTargetEmail(updatedData.getTargetEmail());
        existing.setSendAt(updatedData.getSendAt());
        if (updatedData.getStatus() != null) {
            existing.setStatus(updatedData.getStatus());
        }

        return templateRepository.save(existing);
    }

    public void deleteTemplate(String email, Long id) {
        CustomAnswerTemplate existing = templateRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found"));

        if (!existing.getUser().getEmail().equals(email)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not allowed to delete this template");
        }

        templateRepository.delete(existing);
    }

    public TemplateService(CustomAnswerTemplateRepository templateRepository, UserRepository userRepository) {
        this.templateRepository = templateRepository;
        this.userRepository = userRepository;
    }
}
