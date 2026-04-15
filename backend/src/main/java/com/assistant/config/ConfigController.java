package com.assistant.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private static final Logger logger = LoggerFactory.getLogger(ConfigController.class);

    // The .env file sits at the project root, which is the parent of /backend
    // Inside Docker, we mount it or use a known path. For dev, we look relative to CWD.
    private Path resolveEnvPath() {
        // Try Docker volume mount first (we'll mount .env into the container)
        Path dockerPath = Path.of("/app/.env");
        if (Files.exists(dockerPath)) {
            return dockerPath;
        }
        // Fallback: project root (for local dev)
        Path localPath = Path.of(System.getProperty("user.dir")).getParent().resolve(".env");
        if (Files.exists(localPath)) {
            return localPath;
        }
        // Final fallback: current directory
        return Path.of(".env");
    }

    /**
     * GET /api/config/env
     * Returns the current .env key-value pairs (only the configurable keys).
     */
    @GetMapping("/env")
    public Map<String, String> getEnv() {
        Path envPath = resolveEnvPath();
        Map<String, String> envMap = new LinkedHashMap<>();

        // Define which keys are configurable from the UI
        Set<String> configurableKeys = Set.of(
            "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
            "OPENAI_API_KEY", "VITE_GOOGLE_MAPS_API_KEY"
        );

        try {
            if (Files.exists(envPath)) {
                List<String> lines = Files.readAllLines(envPath);
                for (String line : lines) {
                    String trimmed = line.trim();
                    if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                    int eqIdx = trimmed.indexOf('=');
                    if (eqIdx > 0) {
                        String key = trimmed.substring(0, eqIdx).trim();
                        String value = trimmed.substring(eqIdx + 1).trim();
                        if (configurableKeys.contains(key)) {
                            envMap.put(key, value);
                        }
                    }
                }
            }
        } catch (IOException e) {
            logger.error("Failed to read .env file at {}: {}", envPath, e.getMessage());
        }

        return envMap;
    }

    /**
     * POST /api/config/env
     * Updates the .env file with the provided key-value pairs.
     * Only updates known configurable keys; preserves all other lines.
     */
    @PostMapping("/env")
    public Map<String, Object> saveEnv(@RequestBody Map<String, String> updates) {
        Path envPath = resolveEnvPath();

        Set<String> configurableKeys = Set.of(
            "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
            "OPENAI_API_KEY", "VITE_GOOGLE_MAPS_API_KEY"
        );

        try {
            List<String> existingLines = Files.exists(envPath)
                ? new ArrayList<>(Files.readAllLines(envPath))
                : new ArrayList<>();

            // Track which keys we've already updated in-place
            Set<String> updatedKeys = new HashSet<>();

            for (int i = 0; i < existingLines.size(); i++) {
                String line = existingLines.get(i).trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                int eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    String key = line.substring(0, eqIdx).trim();
                    if (configurableKeys.contains(key) && updates.containsKey(key)) {
                        existingLines.set(i, key + "=" + updates.get(key));
                        updatedKeys.add(key);
                    }
                }
            }

            // Append any new keys that weren't already in the file
            for (Map.Entry<String, String> entry : updates.entrySet()) {
                if (configurableKeys.contains(entry.getKey()) && !updatedKeys.contains(entry.getKey())) {
                    existingLines.add(entry.getKey() + "=" + entry.getValue());
                }
            }

            Files.write(envPath, existingLines, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            logger.info("Successfully updated .env file at {} with keys: {}", envPath, updatedKeys);

            return Map.of("success", true, "message", "Configuration saved. Restart containers to apply changes.");
        } catch (IOException e) {
            logger.error("Failed to write .env file at {}: {}", envPath, e.getMessage());
            return Map.of("success", false, "message", "Failed to save: " + e.getMessage());
        }
    }
}
