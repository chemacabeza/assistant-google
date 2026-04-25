package com.assistant.photos;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/photos")
public class PhotosController {

    private final PhotosService photosService;

    public PhotosController(PhotosService photosService) {
        this.photosService = photosService;
    }

    @GetMapping("/media")
    public ResponseEntity<Object> listMediaItems(
            @RequestParam(defaultValue = "50") int pageSize) {
        return ResponseEntity.ok(photosService.listMediaItems(pageSize));
    }
}
