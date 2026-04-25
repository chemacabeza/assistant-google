# Antigravity Google Assistant Full-Stack

<p align="center">
  <img src="./images/hero.png" alt="AI Butler Assistant" width="400"/>
</p>

A production-ready full-stack application connecting securely to your Google Account (Gmail & Calendar) featuring a conversational AI assistant router and custom email reply templates.

## Architecture & Tech Stack

*   **Backend:** Spring Boot 3.4.3 (Java 21 source compliance), Spring Security OAuth2 Client, Spring WebFlux/WebClient.
*   **Frontend:** React 18, Vite, Tailwind CSS, React Query, Zustand.
*   **Database:** PostgreSQL 16 (handled via Docker Compose).
*   **Containerization:** Fully dockerized (backend on Eclipse Temurin alpine, frontend on Nginx, postgres DB).

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
cp backend/src/main/resources/.env.example backend/src/main/resources/.env

# 3. Edit the .env file with your credentials
nano backend/src/main/resources/.env

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

Create a `.env` file in the `backend/src/main/resources/` directory (you can copy the `.env.example` file provided):

```env
POSTGRES_USER=assistant_user
POSTGRES_PASSWORD=assistant_password
POSTGRES_DB=assistant_db
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/assistant_db

GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

OPENAI_API_KEY=your_openai_api_key_here

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

### 3. Native WhatsApp Bridge Configuration

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


## Security & Privacy Considerations

1. **Frontend Isolation**: Client Secrets and refresh tokens are *never* transmitted to the frontend. The React client identifies via an `HTTPOnly` session cookie issued by Spring Security (`JSESSIONID`).
2. **Encrypted Tokens**: Access Tokens and Refresh Tokens extracted from Google are securely encrypted at rest inside PostgreSQL using transparent JPA `AttributeConverter` utilizing AES.
3. **WebClient Hooks**: The REST Google integrations (`GmailService`, `CalendarService`) are completely decoupled from token refreshing. Spring Security's `ServletOAuth2AuthorizedClientExchangeFilterFunction` manages background refresh procedures automatically.
4. **Audit Logs**: Mutating APIs (like `.sendEmail()` or `.createEvent()`) are transparently logged using Spring AOP (`@Auditable`).

## Notes for LLM Integration
The `AssistantRoutingService` acts as an entry intent engine parsing basic commands ("Show next meetings"). You can substitute the `parseIntent` implementation there with an SDK call to OpenAI or Google Gemini Function Calling models directly on the backend to yield JSON output which maps perfectly into the pre-built `AssistantController`.
