# ── Build stage ───────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app

COPY pom.xml .
COPY src ./src

# BuildKit cache mount keeps the Maven repository between builds
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q clean package -DskipTests

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

COPY --from=build /app/target/google-assistant-*.jar app.jar

# Size the heap from the container memory limit and fail fast on OOM so the restart policy kicks in
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
