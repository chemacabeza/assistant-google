# Antigravity Google Assistant Full-Stack

A production-ready full-stack application connecting securely to your Google Account (Gmail & Calendar) featuring a conversational AI assistant router and custom email reply templates.

## Architecture & Tech Stack

*   **Backend:** Spring Boot 3.4.3 (Java 21 source compliance), Spring Security OAuth2 Client, Spring WebFlux/WebClient.
*   **Frontend:** React 18, Vite, Tailwind CSS, React Query, Zustand.
*   **Database:** PostgreSQL 16 (handled via Docker Compose).
*   **Containerization:** Fully dockerized (backend on Eclipse Temurin alpine, frontend on Nginx, postgres DB).

## Setup Instructions

### 1. Google Cloud Platform Configuration

The application requires a secure OAuth 2.0 Web Client integrated with your Google Account. Here is the step-by-step to set it up:

1.  Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a **New Project** (e.g., "Antigravity Assistant").
3.  Go to **APIs & Services > Library** and enable **both** the `Gmail API` and the `Google Calendar API`.
4.  Go to **APIs & Services > OAuth consent screen**:
    *   Choose **External** (unless you possess a Google Workspace organization, then Internal is fine).
    *   Fill in the mandatory app name and support email.
    *   Click **Add or Remove Scopes**. Add the following:
        *   `.../auth/userinfo.email`
        *   `.../auth/userinfo.profile`
        *   `openid`
        *   `https://www.googleapis.com/auth/gmail.readonly`
        *   `https://www.googleapis.com/auth/gmail.send`
        *   `https://www.googleapis.com/auth/calendar`
    *   Add your own email (`chemacabeza@gmail.com`) as a **Test User** since the app will be in "Testing" mode to circumvent Google's rigorous app verification process.
5.  Go to **APIs & Services > Credentials**:
    *   Click `Create Credentials > OAuth client ID`.
    *   Application type: **Web application**.
    *   Name: `Assistant Web Client`.
    *   **Authorized redirect URIs**: You must add the exact Spring Boot OAuth2 callback URL: `http://localhost:8080/login/oauth2/code/google`
6.  Save, and copy your `Client ID` and `Client Secret`.

### 2. Environment Setup

Create a `.env` file in the `backend/src/main/resources/` directory (you can copy the `.env.example` file provided):

```env
POSTGRES_USER=assistant_user
POSTGRES_PASSWORD=assistant_password
POSTGRES_DB=assistant_db
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/assistant_db

GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

# 256-bit AES encryption key for database token resting
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
```

### 3. Local Development Run

**Option A: Automated Scripts (Recommended)**
We provide three bash scripts to manage the fully dockerised application lifecycles from the root directory:
1.  **Build** the container architecture: `./build.sh`
2.  **Start** the stack (runs detached, attaches to log tails): `./start.sh` (Press `Ctrl+C` to quit logs without stopping containers)
3.  **Stop** the instances cleanly (while preserving database content): `./stop.sh`

Once the stack is started, access your live deployment via `http://localhost:5173`.

**Option B: Independent Development Mode**
1. Start only the robust PostgreSQL database: `docker compose up db -d`
2. Run backend manually via Maven wrapper: `cd backend && ./mvnw spring-boot:run`
3. Run frontend Vite server: `cd frontend && npm run dev`
4. Access `http://localhost:5173`. The Vite proxy will securely map `/api` and `/login` HTTP transactions dynamically.

## Security & Privacy Considerations

1. **Frontend Isolation**: Client Secrets and refresh tokens are *never* transmitted to the frontend. The React client identifies via an `HTTPOnly` session cookie issued by Spring Security (`JSESSIONID`).
2. **Encrypted Tokens**: Access Tokens and Refresh Tokens extracted from Google are securely encrypted at rest inside PostgreSQL using transparent JPA `AttributeConverter` utilizing AES.
3. **WebClient Hooks**: The REST Google integrations (`GmailService`, `CalendarService`) are completely decoupled from token refreshing. Spring Security's `ServletOAuth2AuthorizedClientExchangeFilterFunction` manages background refresh procedures automatically.
4. **Audit Logs**: Mutating APIs (like `.sendEmail()` or `.createEvent()`) are transparently logged using Spring AOP (`@Auditable`).

## Notes for LLM Integration
The `AssistantRoutingService` acts as an entry intent engine parsing basic commands ("Show next meetings"). You can substitute the `parseIntent` implementation there with an SDK call to OpenAI or Google Gemini Function Calling models directly on the backend to yield JSON output which maps perfectly into the pre-built `AssistantController`.
