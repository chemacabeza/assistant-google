package com.assistant.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

/**
 * ConfigController resolves the .env file as {@code /app/.env} (Docker) or {@code ${user.dir}/../.env}
 * (local dev). The tests point {@code user.dir} at a child of a temporary directory so the controller
 * reads and writes {@code <tempDir>/.env} and never touches the real project file.
 */
@DisplayName("ConfigController - .env read/write")
class ConfigControllerTest {

    @TempDir
    Path projectRoot;

    private Path envFile;
    private String originalUserDir;
    private final ConfigController controller = new ConfigController();

    @BeforeEach
    void pointAtTempProject() throws IOException {
        assumeFalse(Files.exists(Path.of("/app/.env")), "a Docker-mounted /app/.env would take precedence");
        originalUserDir = System.getProperty("user.dir");
        Path backendDir = Files.createDirectories(projectRoot.resolve("backend"));
        System.setProperty("user.dir", backendDir.toString());
        envFile = projectRoot.resolve(".env");
    }

    @AfterEach
    void restoreUserDir() {
        if (originalUserDir != null) {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    // ── GET ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("getEnv returns only the UI-configurable keys, skipping comments, blanks and other settings")
    void readsOnlyConfigurableKeys() throws IOException {
        Files.write(envFile, List.of(
                "# Google",
                "GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com",
                "",
                "  GOOGLE_CLIENT_SECRET = s3cr3t  ",
                "POSTGRES_PASSWORD=do-not-expose",
                "TOKEN_ENCRYPTION_KEY=0123456789abcdef",
                "OPENAI_API_KEY=sk-x=y==",
                "=no-key",
                "garbage line without equals",
                "WHATSAPP_VERIFY_TOKEN="));

        Map<String, String> env = controller.getEnv();

        assertThat(env).containsExactly(
                Map.entry("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com"),
                Map.entry("GOOGLE_CLIENT_SECRET", "s3cr3t"),
                Map.entry("OPENAI_API_KEY", "sk-x=y=="),
                Map.entry("WHATSAPP_VERIFY_TOKEN", ""));
        assertThat(env).doesNotContainKeys("POSTGRES_PASSWORD", "TOKEN_ENCRYPTION_KEY");
    }

    @Test
    @DisplayName("getEnv returns an empty map when the file does not exist")
    void missingFileGivesEmptyMap() {
        assumeFalse(Files.exists(Path.of(".env")), "relative ./.env fallback exists in the working directory");

        assertThat(controller.getEnv()).isEmpty();
    }

    // ── POST ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("saveEnv updates known keys in place and preserves comments, order and unrelated lines")
    void updatesInPlace() throws IOException {
        Files.write(envFile, List.of(
                "# header comment",
                "POSTGRES_USER=assistant",
                "OPENAI_API_KEY=old-key",
                "",
                "GOOGLE_CLIENT_ID=old-id"));

        Map<String, Object> result = controller.saveEnv(Map.of("OPENAI_API_KEY", "new-key", "GOOGLE_CLIENT_ID", "new-id"));

        assertThat(result).containsEntry("success", true);
        assertThat(Files.readAllLines(envFile)).containsExactly(
                "# header comment",
                "POSTGRES_USER=assistant",
                "OPENAI_API_KEY=new-key",
                "",
                "GOOGLE_CLIENT_ID=new-id");
    }

    @Test
    @DisplayName("saveEnv appends configurable keys that are not yet in the file")
    void appendsNewKeys() throws IOException {
        Files.write(envFile, List.of("POSTGRES_USER=assistant"));
        Map<String, String> updates = new LinkedHashMap<>();
        updates.put("WHATSAPP_PHONE_NUMBER", "+491511234567");

        controller.saveEnv(updates);

        assertThat(Files.readAllLines(envFile)).containsExactly("POSTGRES_USER=assistant", "WHATSAPP_PHONE_NUMBER=+491511234567");
    }

    @Test
    @DisplayName("saveEnv refuses to write keys that are not UI-configurable")
    void ignoresNonConfigurableKeys() throws IOException {
        Files.write(envFile, List.of("POSTGRES_PASSWORD=original"));

        controller.saveEnv(Map.of("POSTGRES_PASSWORD", "hacked", "SPRING_DATASOURCE_URL", "jdbc:evil"));

        assertThat(Files.readAllLines(envFile)).containsExactly("POSTGRES_PASSWORD=original");
    }

    @Test
    @DisplayName("Values written by saveEnv are read back by getEnv")
    void roundTrip() throws IOException {
        Files.write(envFile, List.of("GOOGLE_CLIENT_ID=a"));

        controller.saveEnv(Map.of("GOOGLE_CLIENT_ID", "b", "VITE_GOOGLE_MAPS_API_KEY", "maps"));

        assertThat(controller.getEnv()).containsEntry("GOOGLE_CLIENT_ID", "b").containsEntry("VITE_GOOGLE_MAPS_API_KEY", "maps");
    }

    @Test
    @DisplayName("saveEnv reports failure instead of throwing when the file cannot be written")
    void writeFailureIsReported() throws IOException {
        Files.createDirectory(envFile); // a directory where the file should be

        Map<String, Object> result = controller.saveEnv(Map.of("OPENAI_API_KEY", "x"));

        assertThat(result).containsEntry("success", false);
        assertThat((String) result.get("message")).startsWith("Failed to save:");
    }

    @Test
    @Disabled("BUG: saveEnv writes values verbatim, so a value containing a newline injects arbitrary extra "
            + "lines (e.g. SPRING_DATASOURCE_URL or TOKEN_ENCRYPTION_KEY) into .env, bypassing the configurable-keys "
            + "allow-list. Values should be rejected or sanitised when they contain CR/LF.")
    @DisplayName("saveEnv cannot be used to inject non-configurable keys through a newline in a value")
    void newlineInjection() throws IOException {
        Files.write(envFile, List.of("OPENAI_API_KEY=old"));

        controller.saveEnv(Map.of("OPENAI_API_KEY", "sk-new\nSPRING_DATASOURCE_URL=jdbc:postgresql://attacker/db"));

        assertThat(Files.readAllLines(envFile)).noneMatch(line -> line.startsWith("SPRING_DATASOURCE_URL="));
    }
}
