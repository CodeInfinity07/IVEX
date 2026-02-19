# RexSquad Bot Manager

## Overview

RexSquad Bot Manager is a comprehensive web-based dashboard for managing a chat bot system. The application provides administrators with tools to configure bot behavior, manage club members, implement content protection, and monitor bot activity in real-time. Built as a full-stack TypeScript application, it features a modern React frontend with a Node.js/Express backend, utilizing file-based storage for configuration and member data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Updates (December 4, 2025)

### Club Information from Environment Variables
- **Dynamic Club Info**: Club Name and Club Code are now loaded from environment variables
- **API Endpoint**: `/api/jack/club-info` returns club configuration from env vars
- **Required Environment Variables**:
  - `CLUB_NAME`: The name of the club (displayed on dashboard)
  - `CLUB_CODE`: The club's unique code (displayed on dashboard)
  - `BOT_UID`: The bot's unique identifier

## Previous Updates (October 5, 2025)

### ✅ Complete API Migration to `/api/jack/*` Pattern
- **Unified API Structure**: All frontend pages now exclusively use `/api/jack/*` endpoints
- **Endpoints Migrated**: Members, Settings, Configuration, Protection (spam-words, banned-patterns, admins)
- **New Features Added**: Exemptions and Loyal Members pages with dedicated API endpoints
- **Data Format Standardized**: All POST requests use `{ data: [...] }` format
- **Route Ordering Fixed**: Specific routes (exemptions, loyal-members) now defined before generic `:type` handlers

### Bot Integration Enhancement
- **Comprehensive Bot API**: 40+ game commands, chat responses, member management via `/api/jack/*`
- **OpenAI Integration**: GPT-3.5-turbo for intelligent chat responses with customizable tone
- **WebSocket Support**: Live club connection with auto-reconnect (requires valid credentials in .env)
- **Environment Configuration**: `.env` file for bot credentials (CLUB_CODE, BOT_UID, EP, KEY, OPENAI_API_KEY)

### New Features
- **Exemptions System**: Manage users protected from automated moderation actions
- **Loyal Members Tracking**: Track and manage VIP club members with special privileges
- **Sidebar Navigation**: All pages accessible via Material Design 3 compliant sidebar
- **Production Build**: `npm run build` compiles both frontend and backend for deployment

## System Architecture

### Frontend Architecture

**Framework & Tooling**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast hot module replacement
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching

**UI Component System**
- Radix UI primitives for accessible, headless components
- shadcn/ui component library with custom theming (New York style variant)
- Tailwind CSS for utility-first styling with custom design tokens
- Material Design 3 principles adapted for dashboard-optimized patterns

**Design System**
- Custom color palette supporting light/dark themes via CSS variables
- Inter font family for consistent typography
- Responsive layout using CSS Grid and Flexbox
- Component variants managed through class-variance-authority (CVA)

**State Management Strategy**
- React Query for API data fetching, caching, and synchronization
- React Hook Form with Zod validation for form state and validation
- Local component state for UI-specific interactions
- Theme context for dark/light mode persistence

### Backend Architecture

**Server Framework**
- Express.js for RESTful API endpoints
- TypeScript for type safety across the stack
- File-based routing pattern in `server/routes.ts`
- Custom Vite integration for development mode with HMR

**Data Storage Strategy**
- File-based storage using JSON and text files in the `/data` directory
- No database required - all configuration persisted to disk
- Asynchronous file operations using `fs/promises`
- Structured data files:
  - `club_members.json` - Member roster with UID, name, and level
  - `settings.json` - Bot configuration settings
  - `bot_configuration.json` - Bot personality and messaging
  - `spam.txt` - Line-separated spam word list
  - `banned_patterns.txt` - Comma-separated banned URL patterns
  - `admins.txt` - Comma-separated admin list

**API Design Pattern**
- RESTful endpoints following resource-based URL structure
- Consistent response format: `{ success: boolean, data: any }`
- Error handling middleware for unified error responses
- CORS enabled for development workflow

**Key API Endpoints**
- `/api/members` - Member CRUD operations with pagination
- `/api/settings` - Bot settings management
- `/api/config/bot` - Bot personality configuration
- `/api/protection/*` - Content filtering lists (spam-words, banned-patterns, admins)
- `/api/bot/status` - Bot operational status (placeholder for future WebSocket integration)

### External Dependencies

**UI Component Libraries**
- @radix-ui/* - Comprehensive suite of accessible UI primitives (accordion, dialog, dropdown, select, etc.)
- lucide-react - Icon library for consistent visual elements
- react-day-picker - Calendar/date selection component

**Form & Validation**
- react-hook-form - Performant form state management
- @hookform/resolvers - Integration layer for validation schemas
- zod - TypeScript-first schema validation
- drizzle-zod - Integration between Drizzle ORM and Zod (prepared for future database migration)

**Data Fetching & State**
- @tanstack/react-query - Asynchronous state management
- axios - HTTP client (available but fetch API primarily used)

**Styling & Theming**
- tailwindcss - Utility-first CSS framework
- class-variance-authority - Type-safe component variant management
- clsx & tailwind-merge - Conditional className utilities

**Build & Development Tools**
- vite - Next-generation build tool
- @vitejs/plugin-react - React support for Vite
- esbuild - Fast JavaScript bundler for production server build
- tsx - TypeScript execution for development server

**Database Preparation (Not Yet Active)**
- drizzle-orm - TypeScript ORM (schema defined but not connected)
- @neondatabase/serverless - Serverless PostgreSQL driver
- drizzle-kit - Schema migration toolkit
- Note: Drizzle schema exists in `shared/schema.ts` but file-based storage currently in use

**Session Management (Available)**
- express-session - Session middleware (imported but not implemented)
- connect-pg-simple - PostgreSQL session store (for future use)

**Replit Integration**
- @replit/vite-plugin-runtime-error-modal - Development error overlay
- @replit/vite-plugin-cartographer - Replit-specific tooling
- @replit/vite-plugin-dev-banner - Development environment indicator

### Architectural Decisions

**File-Based Storage vs. Database**
- Problem: Need persistent configuration and member data
- Solution: JSON/text file storage in `/data` directory
- Rationale: Simpler deployment, no database provisioning required, sufficient for admin panel use case
- Trade-off: Limited scalability but adequate for current requirements
- Future Path: Drizzle ORM schema prepared for migration to PostgreSQL when scale demands it

**Monorepo Structure**
- Problem: Share types between frontend and backend
- Solution: `/shared` directory for common schemas and types
- Rationale: Type safety across client-server boundary, single source of truth
- Implementation: TypeScript path aliases (@shared/*) for clean imports

**Component Library Choice**
- Problem: Need accessible, customizable UI components
- Solution: Radix UI primitives + shadcn/ui patterns
- Rationale: Unstyled primitives allow full design control while maintaining accessibility
- Benefit: Tailwind-based styling enables rapid customization without CSS-in-JS overhead

**State Management Architecture**
- Problem: Balance between local state and server state
- Solution: React Query for server data, local state for UI concerns
- Rationale: Automatic caching, background refetching, and optimistic updates
- Alternative Considered: Redux (rejected due to complexity overhead for this use case)

**Theme Implementation**
- Problem: Support light/dark modes with complex color systems
- Solution: CSS variables with Tailwind integration
- Rationale: Dynamic theming without JavaScript re-renders, better performance
- Implementation: HSL color space for programmatic manipulation of shades

**Development Workflow**
- Problem: Fast iteration during development
- Solution: Vite with custom Express integration
- Rationale: HMR for frontend, nodemon-like restart for backend changes
- Implementation: Vite middleware mode with separate server process in development