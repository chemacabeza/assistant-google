# ── Build stage ───────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app

COPY pom.xml .
COPY src ./src

# Optional Maven Central mirror. CI sets it because Central answers shared GitHub runner IPs
# with 429 Too Many Requests; left empty, Maven talks to Central directly.
ARG MAVEN_MIRROR_URL=
# Rate-limited (429) or unavailable (503) responses are retried with backoff instead of
# failing the build after the default three quick attempts.
ENV MAVEN_ARGS="-Daether.connector.http.retryHandler.count=8 -Daether.connector.http.retryHandler.interval=5000 -Daether.connector.http.retryHandler.intervalMax=60000"

# BuildKit cache mount keeps the Maven repository between builds
RUN --mount=type=cache,target=/root/.m2 \
    if [ -n "$MAVEN_MIRROR_URL" ]; then \
      printf '<settings><mirrors><mirror><id>central-mirror</id><mirrorOf>central</mirrorOf><url>%s</url></mirror></mirrors></settings>' \
        "$MAVEN_MIRROR_URL" > /tmp/mirror-settings.xml; \
      set -- -s /tmp/mirror-settings.xml; \
    fi; \
    mvn -B -q "$@" clean package -DskipTests

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

COPY --from=build /app/target/google-assistant-*.jar app.jar

# Size the heap from the container memory limit and fail fast on OOM so the restart policy kicks in
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
