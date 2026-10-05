# Antigravity Google Assistant Full-Stack

<p align="center">
  <img src="./images/hero.png" alt="AI Butler Assistant" width="400"/>
</p>

A production-ready full-stack application connecting securely to your Google Account (Gmail & Calendar) featuring a conversational AI assistant router and custom email reply templates.

## Architecture & Tech Stack

*   **Backend:** Spring Boot 3.5 on Java 25, Spring Security OAuth2 Client, Spring WebFlux/WebClient, Spring Data JPA.
*   **Frontend:** React 18, Vite, Tailwind CSS, React Query, Zustand, served by Nginx in production.
*   **WhatsApp bridge:** Node 20 service built on [Baileys](https://github.com/WhiskeySockets/Baileys) (direct WhatsApp multi-device protocol, no Puppeteer).
*   **Database:** PostgreSQL 16.
*   **Containerization:** Every service is a self-contained multi-stage Docker build; only Docker is needed on the host.
*   **Tests:** JUnit 5 + Mockito unit, `@WebMvcTest` and H2-backed repository/integration tests for the backend, Vitest + React Testing Library + MSW component tests and ESLint for the frontend, and a Playwright end-to-end suite that runs the whole stack against a mock Google OAuth2 provider.

## Repository Layout

| Path | What lives there |
| :--- | :--- |
| `backend/` | Spring Boot API: OAuth2 login, Google integrations, assistant routing, WhatsApp ingest, scheduled emails |
| `frontend/` | React single-page app (Dashboard, Assistant, Gmail, Calendar, Drive, Photos, Maps, WhatsApp, Templates, Configuration) |
| `whatsapp-bridge/` | Node service that links a WhatsApp account by QR code and pushes chats/messages to the backend |
| `e2e/` | Playwright suite, mock Google OIDC provider and the isolated `docker-compose.e2e.yml` override |
| `docker-compose.yml`, `build.sh`, `start.sh`, `stop.sh`, `restart.sh` | Production-style stack and its lifecycle scripts |
| `.env.example` | Every environment variable the stack reads, with comments |
| `.github/workflows/ci.yml` | CI: backend tests, frontend lint/build, bridge syntax check, full e2e run |

## Required APIs

This application integrates with the following external services. You must create accounts and obtain credentials for each:

| Service | Purpose | Direct Link |
| :--- | :--- | :--- |
| **Gmail API** | Read inbox and send emails | [Enable Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) |
| **Google Calendar API** | Read and create calendar events | [Enable Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) |
| **Google People API** | Access Google Contacts to resolve names to emails | [Enable People API](https://console.cloud.google.com/apis/library/people.googleapis.com) |
| **Google Drive API** | Access and manage files in Google Drive | [Enable Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) |
| **Google Drive Activity API** | Track changes and activity in Google Drive | [Enable Drive Activity API](https://console.cloud.google.com/apis/library/driveactivity.googleapis.com) |
| **Google Drive Labels API** | Manage file metadata and labels in Drive | [Enable Drive Labels API](https://console.cloud.google.com/apis/library/drivelabels.googleapis.com) |
| **Photos Library API** | Access and manage files in Google Photos | [Enable Photos Library API](https://console.cloud.google.com/apis/library/photoslibrary.googleapis.com) |
| **Google Photos Picker API** | Allow users to select photos securely | [Enable Photos Picker API](https://console.cloud.google.com/apis/library/photospicker.googleapis.com) |
| **Google Photos Ambient API** | Support for ambient photo frames | [Enable Photos Ambient API](https://console.cloud.google.com/apis/library/photosambient.googleapis.com) |
| **Maps JavaScript API** | Render interactive maps in the browser | [Enable Maps API](https://console.cloud.google.com/apis/library/maps-backend.googleapis.com) |
| **Maps Directions API** | Calculate driving routes and durations | [Enable Directions API](https://console.cloud.google.com/apis/library/directions-backend.googleapis.com) |
| **Places API** | Autocomplete and place search functionality | [Enable Places API](https://console.cloud.google.com/apis/library/places-backend.googleapis.com) |
| **Google OAuth 2.0** | User authentication and authorization | [OAuth Credentials](https://console.cloud.google.com/apis/credentials) |
| **OpenAI API** | AI assistant intent parsing and responses | [Get API Key](https://platform.openai.com/api-keys) |

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/chemacabeza/assistant-google.git
cd assistant-google

# 2. Copy the environment template
cp .env.example .env

# 3. Edit the .env file with your credentials
nano .env

# 4. Build the Docker containers
./build.sh

# 5. Start the application
./start.sh

# 6. Open in your browser
# → http://localhost:5173
```

## Setup Instructions

### 1. Google Cloud Platform Configuration

The application requires a secure OAuth 2.0 Web Client integrated with your Google Account. Here is the step-by-step to set it up:

1.  Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a **New Project** (e.g., "Antigravity Assistant").
3.  Go to **APIs & Services > Library** and enable **all** the required Google APIs listed in the table above.
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
        *   `https://www.googleapis.com/auth/contacts.readonly`
        *   `https://www.googleapis.com/auth/contacts.other.readonly`
        *   `https://www.googleapis.com/auth/drive`
        *   `https://www.googleapis.com/auth/drive.activity.readonly`
        *   `https://www.googleapis.com/auth/drive.labels.readonly`
        *   `https://www.googleapis.com/auth/photoslibrary.readonly`
        *   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
    *   Add your own email (e.g., `test@gmail.com`) as a **Test User** since the app will be in "Testing" mode to circumvent Google's rigorous app verification process.
5.  Go to **APIs & Services > Credentials**:
    *   Click `Create Credentials > OAuth client ID`.
    *   Application type: **Web application**.
    *   Name: `Assistant Web Client`.
    *   **Authorized redirect URIs**: You must add the exact Spring Boot OAuth2 callback URL: `http://localhost:8080/login/oauth2/code/google`
6.  Save, and copy your `Client ID` and `Client Secret`.

### 2. Environment Setup

Create a `.env` file in the repository root (copy the `.env.example` file provided). Docker Compose reads it automatically, the backend loads it when run outside Docker, and the **Configuration** page in the UI edits the same file:

```env
# Required
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
# 16, 24 or 32 characters; encrypts Google tokens at rest (openssl rand -hex 16)
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef

# Optional integrations (leave empty to disable the feature)
OPENAI_API_KEY=
VITE_GOOGLE_MAPS_API_KEY=
TELEGRAM_BOT_TOKEN=
```

`.env.example` lists and documents every other variable (database credentials, `APP_FRONTEND_URL`, WhatsApp settings).

### 3. Running the Stack

**Option A: Docker (Recommended)**
Three scripts in the repository root manage the fully dockerised stack:
1.  **Build** the images: `./build.sh` (only Docker is required on the host)
2.  **Start** the stack detached and tail the logs: `./start.sh` (`Ctrl+C` leaves the containers running)
3.  **Stop** the containers while keeping the database volume: `./stop.sh`

| Service | URL on the host |
| :--- | :--- |
| Web UI (Nginx, proxies `/api` to the backend) | `http://localhost:5173` |
| Backend API | `http://127.0.0.1:8081` |
| PostgreSQL | `127.0.0.1:5433` |
| WhatsApp bridge | `http://127.0.0.1:3001` |

**Option B: Backend and frontend on the host (hot reload)**
1. Start only PostgreSQL: `docker compose up db -d` (published on port `5433`, which the default `SPRING_DATASOURCE_URL` in `.env.example` already uses).
2. Start the backend: `cd backend && ./mvnw spring-boot:run`. It reads the repo-root `.env`. If you also want the WhatsApp bridge, start it with `docker compose up whatsapp-bridge -d` and set `BRIDGE_URL=http://localhost:3001` in `.env`.
3. Start the frontend: `cd frontend && npm install && npm run dev`.
4. Open `http://localhost:5173`. The Vite dev server proxies `/api`, `/oauth2` and `/login` to the backend on port 8080.

### 4. Native WhatsApp Bridge Configuration

The application features a built-in WhatsApp bridge that connects directly to the WhatsApp protocol (multi-device) via the [Baileys](https://github.com/WhiskeySockets/Baileys) library. This allows you to "link" your own personal WhatsApp account by simply scanning a QR code, exactly like WhatsApp Web.

**No Meta Business API or developer tokens are required.**

#### Step-by-step Setup

1.  **Start the Stack**:
    *   Ensure the `whatsapp-bridge` container is running (it starts automatically with `./start.sh`).
    *   The bridge defaults to port `3001` and is proxied by the backend.

2.  **Link your Device**:
    *   Open the application and navigate to the **WhatsApp** page (`/whatsapp`).
    *   If not authenticated, a **QR Code** will appear on the screen.
    *   Open WhatsApp on your phone → `Settings` → `Linked Devices` → `Link a Device`.
    *   Scan the QR code displayed in the assistant dashboard.

3.  **Synchronization**:
    *   Once scanned, the bridge will automatically synchronize your recent chat history and contacts into the local PostgreSQL database.
    *   Incoming messages will be pushed in real-time to the dashboard via Socket.io.

4.  **AI Assistant Tooling**:
    *   The AI Assistant can now natively send messages through your linked account. You can ask: *"Send a WhatsApp to Carlos saying I'm running late."*


## Testing

| What | Command | Notes |
| :--- | :--- | :--- |
| Backend tests | `cd backend && ./mvnw test` | Unit tests (JUnit 5 + Mockito), controller and security tests (`@WebMvcTest`), repository tests and a full-context integration test on in-memory H2. No database, Docker or network needed; Google and OpenAI calls are stubbed. Tests marked `@Disabled("BUG: ...")` document known bugs. |
| Frontend tests | `cd frontend && npm ci && npm test` | Vitest + React Testing Library, with the API mocked by MSW. `npm run test:coverage` writes a report to `frontend/coverage/`, `npm run test:watch` re-runs on change. `it.skip('BUG: ...')` tests document known bugs. |
| Frontend lint and build | `cd frontend && npm run lint && npm run build` | ESLint must report zero errors |
| Bridge syntax check | `cd whatsapp-bridge && npm ci && node --check index.js` | |
| End-to-end suite | `e2e/run.sh` | Needs Docker and Node 20+. Builds an isolated stack (own compose project, volumes and ports, a mock Google OIDC provider) and runs Playwright against the real backend, database, bridge and UI. Your normal stack and data are never touched. `e2e/run.sh --project=backend` runs one area; `E2E_KEEP_STACK=1` leaves the stack up for debugging. |

The GitHub Actions workflow in `.github/workflows/ci.yml` runs all of these on every push to `master` and on pull requests. Dependabot keeps Maven, npm, Docker base images and the Actions up to date.

## Security & Privacy Considerations

1. **Frontend Isolation**: Client Secrets and refresh tokens are *never* transmitted to the frontend. The React client identifies via an `HTTPOnly` session cookie issued by Spring Security (`JSESSIONID`).
2. **Encrypted Tokens**: Google access and refresh tokens are encrypted at rest in PostgreSQL with AES-GCM (random IV, authenticated) through a transparent JPA `AttributeConverter`. Set a real `TOKEN_ENCRYPTION_KEY`; the backend refuses to start with a key of the wrong length.
3. **WebClient Hooks**: The REST Google integrations (`GmailService`, `CalendarService`) are completely decoupled from token refreshing. Spring Security's `ServletOAuth2AuthorizedClientExchangeFilterFunction` manages background refresh procedures automatically.
4. **Audit Logs**: Mutating APIs (like `.sendEmail()` or `.createEvent()`) are transparently logged using Spring AOP (`@Auditable`).
5. **Error responses**: API errors are returned as `{status, message, timestamp}`. Client mistakes get a 4xx, upstream failures (Google, OpenAI, the bridge) a 502, and anything unexpected a 500 with a generic message; stack traces and upstream bodies stay in the server logs.
6. **CSRF**: State-changing requests must echo the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header. Only the bridge ingest endpoints and the Meta webhook are exempt.

## How the Assistant Works
`AssistantRoutingService` sends the conversation to OpenAI (`gpt-4o-mini`) with a set of function-calling tools backed by the Google and WhatsApp services: `fetch_recent_emails`, `fetch_upcoming_meetings`, `calculate_travel_duration`, `schedule_calendar_event`, `delete_calendar_event`, `search_google_contacts`, `send_email` and `send_whatsapp_message`. Tool calls are executed on the backend and their results fed back to the model until it produces a final answer. Rate-limit responses are retried with exponential backoff. To use another provider or model, change the request in `callOpenAiWithRetry` and the `model` field in `callOpenAiWithTools`; the tool definitions and executors are provider-agnostic JSON. The same service answers Telegram messages when `TELEGRAM_BOT_TOKEN` is set.
