# RexSquad Bot Manager

## Overview

RexSquad Bot Manager is a comprehensive web-based dashboard for managing a LudoStar club bot system. The application provides administrators with tools to configure bot behavior, manage club members, implement content moderation, and monitor real-time bot activity. The system integrates with LudoStar's WebSocket API for live club interaction and uses OpenAI's GPT-3.5-turbo for intelligent chat responses with customizable personality tones.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture Pattern

**Monorepo Structure**: Single repository containing both frontend (React/TypeScript) and backend (Express/Node.js) with shared TypeScript types. The application uses a unified build process that compiles both client and server code.

**Development vs Production**: Vite development server with hot module replacement for frontend development, with Express serving static files in production. The `server/vite.ts` module handles the conditional setup.

### Frontend Architecture

**Framework Selection**: React 18 with TypeScript chosen for type safety and modern component patterns. Wouter provides lightweight client-side routing without the overhead of React Router.

**State Management Strategy**: TanStack Query (React Query) handles all server state with automatic caching, refetching, and optimistic updates. No global state library (Redux/Zustand) needed since all data comes from the backend.

**UI Component System**: Radix UI primitives provide accessible, headless components. shadcn/ui wraps these with Tailwind CSS styling following Material Design 3 principles adapted for dashboard use. The "New York" style variant provides modern, clean aesthetics.

**Styling Approach**: Tailwind CSS utility-first approach with custom design tokens defined in CSS variables for theme support. Light/dark mode implemented via CSS class switching on the root element.

**API Communication**: Centralized `apiRequest` function in `lib/queryClient.ts` handles all HTTP requests with consistent error handling and credential management.

### Backend Architecture

**Framework Choice**: Express.js chosen for its simplicity and extensive middleware ecosystem. TypeScript compilation via `tsx` for development and `esbuild` for production builds.

**File-Based Data Storage**: JSON and text files in the `data/` directory serve as the persistence layer. This approach was chosen over a database for simplicity and portability, suitable for the bot's operational scale.

**API Design Pattern**: RESTful endpoints under `/api/jack/*` namespace provide CRUD operations for bot configuration, members, protection rules, and status monitoring. Consistent response format: `{ success: boolean, data: any }`.

**Modular Route Organization**: Routes defined in `server/routes.ts` with bot integration logic separated into `server/bot-integration.ts`. This separation allows independent development and testing of WebSocket bot functionality.

### Real-Time Bot Integration

**WebSocket Connection**: Native WebSocket client connects to LudoStar's club server using encrypted credentials (EP token and KEY). Auto-reconnect logic handles connection failures.

**Authentication Flow**: Bot authenticates using encrypted payload format specific to LudoStar's protocol. Credentials stored in environment variables for security.

**Message Processing Pipeline**: Incoming WebSocket messages parsed for club events (joins, messages, kicks). Bot processes commands, enforces moderation rules, and sends responses via the same WebSocket connection.

**Command System**: Dual command structure - public commands available to all members (e.g., `/mic`, `/whois`) and admin-only commands (e.g., `/kick`, `/ban`, `/icic`). Command permissions verified against admin list from `data/admins.txt`.

**Moderation Engine**: Multi-layer protection system:
- Spam word detection from `data/spam.txt`
- Banned pattern matching (URLs, invite links)
- Level-based restrictions (configurable minimum level)
- Guest ID enforcement
- Avatar requirement checks

**Punishment Actions**: Configurable punishment system allows different actions (kick vs ban) for different violation types. Settings stored in `data/settings.json`.

### AI Integration

**OpenAI GPT-3.5-Turbo**: Chat completion API provides conversational responses when users address the bot by name. Conversation history maintained per user with 10-message context window.

**Personality System**: Nine predefined tone templates (upbeat, sarcastic, wise, chill, phuppo, gangster, party, molvi, flirty) shape bot responses. Templates use Roman Urdu/Punjabi for regional appeal. Active tone configurable via dashboard.

**Prompt Engineering**: System prompts enforce character consistency, language preferences, and response length constraints. Bot name dynamically injected into prompts.

### Data Models

**Member Structure**: Each member object contains:
- `UID`: Encrypted user identifier
- `NM`: Display name (supports Unicode/emoji)
- `LVL`: Player level (1-100+)
- `GC`: Guest code (player ID)
- Additional metadata (SNUID, role, etc.)

**User Tracking**: `data/users.json` maintains player history with name changes, UIDs, and last seen timestamps. Enables `/whois` command functionality.

**Daily Message Counter**: `data/message_counter.json` tracks daily message count with automatic reset at 12:00 AM Pakistani time (UTC+5). Structure: `{ count: number, date: "YYYY-MM-DD" }`. Counter increments when WebSocket messages containing `PY.MG` field are received.

**User Session Time Tracking**: `club_members.json` tracks member time spent in the club. When users join (`PU: 'UJ'`), their join timestamp is recorded in an `activeSessions` Map. When they leave (`PU: 'UL'`), session duration is calculated and added to their `timeTracking` object with fields:
- `totalSeconds`: All-time seconds spent in club
- `dailySeconds`: Seconds today (resets daily at 12:00 AM PKT)
- `weeklySeconds`: Seconds this week (resets Sunday 2:00 AM PKT)
- `monthlySeconds`: Seconds this month (resets 1st of each month 12:00 AM PKT)
- `lastDayReset`: ISO date of last daily reset
- `lastWeekReset`: ISO date of last weekly reset
- `lastMonthReset`: ISO date of last monthly reset

API endpoints `/api/jack/member-time/:uid` and `/api/jack/members-time` provide time statistics. Dashboard Members page displays weekly/monthly hours as badges.

**Top Active Members**: The `/api/jack/top-active` endpoint returns the top 3 most active members for daily, weekly, and monthly periods based on time spent in the club. The Overview page displays these in a "Top Active Members" section with three cards.

**Configuration Files**: Text-based lists (comma-separated or line-separated) for admins, spam words, banned patterns, exemptions, and loyal members. Simple format allows manual editing if needed.

**Feature Toggles**: `data/feature_toggles.json` stores enable/disable state for 8 feature groups: Music (/song, /play, /pause, /next, /stop, /rec), Dedications (/dedicate), Moderation (empty - /ub is utility), Hitlist (auto-kick on join), Blacklist (auto-ban on join), Info & Stats (/wtop, /mtop, /whois, /seen, /member - /mic is utility), AI/Voice (/talk), Fun (/secret, /read). Each command handler checks `isCommandEnabled()` before executing. A universal short-circuit handler sends "feature disabled" messages. Secret admin page at `/features` (password: WICKED@123!@#) manages toggles. Public `/feature-status` page (inside dashboard) shows current states. API endpoints: POST `/api/jack/features/verify-password`, POST `/api/jack/features/get`, POST `/api/jack/features/update`, GET `/api/jack/features/status` (public, no auth).

**Page Protection System**: `data/page_protection.json` stores bcrypt-hashed password and a map of page IDs to boolean protection status. Owner sets a protection password on first visit to `/page-protection`, then toggles which dashboard pages require the password before access. The PageProtectionWrapper component checks each page's protection status via `/api/page-protection/check-page` and shows a password prompt if protected. Verified pages are cached in-memory per tab session. API endpoints: GET `/api/page-protection/status`, POST `/api/page-protection/set-password`, POST `/api/page-protection/change-password`, POST `/api/page-protection/verify`, POST `/api/page-protection/update`, POST `/api/page-protection/check-page`. The Page Protection page itself requires the protection password after initial setup.

### Authentication System

**Dashboard Access Control**: The dashboard requires authentication to access. Two user types are supported:

- **Owner**: Has full access to all features including creating/managing moderators and viewing activity logs. Owner credentials are stored in environment variables (`OWNER_ID`, `OWNER_PASSWORD`).
- **Moderator**: Can access all dashboard features except moderator management and activity logs. Moderator accounts are created by the owner and stored in `data/moderators.json` with bcrypt-hashed passwords.

**Session Management**: Token-based authentication with in-memory session storage. Sessions include user ID, role, and login time. Tokens are generated using crypto.randomBytes for security.

**Activity Logging**: All login/logout events and moderator management actions are tracked in `data/activity_logs.json`. The Activity Logs page (owner-only) displays this history with pagination.

**Auth Flow**:
1. User enters credentials on login page
2. Server validates against owner credentials or moderator list
3. Session token generated and stored
4. Frontend stores token in localStorage and includes in API request headers
5. Protected API endpoints validate token via authMiddleware

### Security Considerations

**Credential Management**: Bot authentication credentials (EP, KEY, BOT_UID) stored in `.env` file, never committed to version control. Production deployments must set these environment variables. MySQL credentials also use environment variables only (no hardcoded defaults).

**Password Hashing**: Moderator passwords are hashed with bcrypt (10 salt rounds) before storage. The system supports both legacy plaintext and hashed passwords for backward compatibility during migration.

**Role-Based Access**: Server-side middleware (`ownerOnly`) enforces owner-only access for moderator CRUD operations and activity logs. Client-side checks hide UI elements but server enforcement provides actual security.

**Password Protection**: Critical bot control actions (restart, credential updates) require admin password verification via dialog prompts.

**Input Validation**: All user inputs validated before processing. Member additions require level constraints, configuration updates sanitize content.

## External Dependencies

### Third-Party Services

**OpenAI API**: GPT-3.5-turbo model for conversational AI. Requires `OPENAI_API_KEY` environment variable. Fallback behavior: bot continues functioning without AI responses if key missing.

**LudoStar WebSocket Server**: Proprietary gaming platform API at undisclosed endpoint. Requires valid club authentication credentials (EP token, KEY). Connection state exposed via `/api/jack/status` endpoint.

### Database & Storage

**File System**: All data persisted to local file system in `data/` directory. JSON files for structured data (members, settings, configuration), text files for simple lists (admins, spam words).

**No Database Engine**: Intentional architectural decision to avoid database dependency. Suitable for single-instance deployment with moderate data volumes (hundreds of members, not thousands).

### Frontend Libraries

**Radix UI**: Comprehensive collection of accessible, unstyled React components. Provides 25+ primitives including dialogs, dropdowns, tooltips, tabs, etc.

**TanStack Query**: Server state management with intelligent caching. Handles loading states, error boundaries, automatic refetching, and optimistic updates.

**Tailwind CSS**: Utility-first CSS framework with JIT compiler. Custom configuration extends default theme with design system tokens.

**React Hook Form**: Form state management with Zod schema validation. Reduces boilerplate for complex forms like configuration and settings pages.

**date-fns**: Date formatting and manipulation. Chosen over moment.js for smaller bundle size and tree-shaking support.

### Backend Libraries

**Express**: Minimal web framework for Node.js. Handles HTTP routing, middleware, and static file serving.

**WebSocket (ws)**: Standards-compliant WebSocket client for Node.js. Handles LudoStar club connection with custom protocol implementation.

**Axios**: HTTP client for external API calls. Used for OpenAI API requests and potential future integrations.

**dotenv**: Environment variable management from `.env` files. Loads configuration at runtime without hardcoding secrets.

### Build Tooling

**Vite**: Next-generation frontend build tool. Provides instant HMR during development, optimized production builds with code splitting.

**esbuild**: Ultra-fast JavaScript bundler for backend compilation. Compiles TypeScript server code to ESM format for production.

**TypeScript**: Type safety across entire codebase. Shared types in `shared/` directory ensure contract between frontend and backend.

**Drizzle Kit**: Schema management toolkit configured for PostgreSQL (via `drizzle.config.ts`), though not actively used in current implementation. Prepared for future database migration if file-based storage proves insufficient.