package com.assistant.drive;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/drive")
public class DriveController {

    private final DriveService driveService;

    public DriveController(DriveService driveService) {
        this.driveService = driveService;
    }

    @GetMapping("/files")
    public ResponseEntity<Object> listFiles(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "15") int maxResults) {
        return ResponseEntity.ok(driveService.listFiles(q, maxResults));
    }

    @GetMapping("/files/{fileId}/activity")
    public ResponseEntity<Object> getFileActivity(@PathVariable String fileId) {
        return ResponseEntity.ok(driveService.getFileActivity(fileId));
    }

    @GetMapping("/labels")
    public ResponseEntity<Object> listLabels() {
        return ResponseEntity.ok(driveService.listLabels());
    }
}
