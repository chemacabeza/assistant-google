# ── Build stage ───────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Cache Maven dependencies first (layer cache friendly)
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Build the JAR
COPY src ./src
RUN mvn clean package -q -DskipTests

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/google-assistant-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
