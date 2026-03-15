# Platter – Weekly Meal Planner & Grocery List Generator

## Overview

Platter is a consumer-friendly web app for weekly meal planning and grocery list generation. It helps users:
- Build and manage a personal recipe library (manual entry, URL import, or AI discovery)
- Generate weekly meal plans using saved recipes
- Produce categorized grocery/shopping lists from a plan
- Manage pantry staples to exclude always-available ingredients from shopping lists
- Discover new recipes via AI suggestions

The app is mobile-first with an iOS-like feel, featuring bottom-tab navigation on mobile and a sidebar on desktop.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Full-Stack Structure
- **Monorepo** with three main directories: `client/` (React frontend), `server/` (Express backend), `shared/` (shared types, schema, and route definitions)
- **Single Express server** serves both the API and (in production) the built static frontend
- **Vite** is used for the frontend dev server and build; in dev mode, Express proxies through Vite middleware

### Frontend (`client/src/`)
- **React** with **TypeScript**, bundled via **Vite**
- **Routing**: `wouter` (lightweight client-side router)
- **State / Data Fetching**: `@tanstack/react-query` with custom hooks in `hooks/` — each data domain (recipes, pantry, weekly plans) has its own hook file
- **UI Components**: `shadcn/ui` (Radix UI primitives + Tailwind utility classes). Component files live in `client/src/components/ui/`
- **Styling**: Tailwind CSS with CSS variables for theming; mint/emerald green primary, coral/orange accent, large border-radius for a modern look. Fonts: Plus Jakarta Sans (display) + Inter (body)
- **Animations**: `framer-motion` for page transitions and micro-interactions
- **Forms**: `react-hook-form` + `@hookform/resolvers` with Zod validation
- **Pages**:
  - `/` → `PlanPage` (weekly plan view, generate/regenerate, delete)
  - `/recipes` → `RecipesPage` (library + quick URL import)
  - `/pantry` → `PantryPage` (staples management)
  - `/shopping-list/:id` → `ShoppingListPage` (categorized checklist)
  - `/discover` → `DiscoveryPage` (AI-suggested recipes, approve/reject)

### Backend (`server/`)
- **Express** with TypeScript, run via `tsx` in development
- **Route registration** in `server/routes.ts`; all API path strings and Zod input schemas are defined in `shared/routes.ts` and imported by both client and server (type-safe API contract)
- **Storage layer** (`server/storage.ts`): `DatabaseStorage` class implementing an `IStorage` interface. All DB access goes through this abstraction. This makes swapping the underlying DB straightforward.
- **Recipe import**: Multiple modes — URL (cheerio scraping + AI), paste-text (AI extraction from captions/text), bulk URL (sequential with progress). TikTok/Instagram detected and given helpful error pointing to paste-text
- **AI features**: OpenAI integration (via Replit AI Integrations) used for recipe discovery, generation, and extraction
- **Simplified meal planning**: Plan generation picks max 3 "full" recipes/week; remaining dinner slots use "simple" assembly meals; lunches alternate between dinner leftovers and simple meals
- **Duplicate detection**: Handled at the storage level using recipe title and URL

### Shared (`shared/`)
- `shared/schema.ts`: Drizzle ORM table definitions and Zod insert schemas for all entities
- `shared/routes.ts`: Centralized API route definitions (method, path, Zod input/output schemas) consumed by both frontend hooks and backend route handlers
- `shared/models/chat.ts`: Chat/conversation schema (for Replit audio/chat integrations)

### Database
- **PostgreSQL** via `drizzle-orm/node-postgres` and the `pg` Pool
- **Drizzle ORM** for type-safe queries; schema defined in `shared/schema.ts`
- Migrations output to `./migrations/`; schema pushed with `drizzle-kit push`
- **Tables**:
  - `recipes`: Full recipe metadata, ingredients as JSONB array, approval flag (for discovered recipes), discovery score/reason, `recipeType` ('full'|'simple'|'leftovers')
  - `pantry_staples`: Normalized ingredient names with stock status
  - `weekly_plans`: Plan metadata (start date, lunch/dinner counts, servings)
  - `weekly_plan_meals`: Join table linking plans to recipes with per-meal overrides
  - `conversations` / `messages`: Chat history for AI integrations

### Replit Integrations (`server/replit_integrations/`)
- Modular integration modules: `audio/`, `chat/`, `image/`, `batch/`
- **Audio**: Voice recording, streaming PCM16 playback via AudioWorklet, speech-to-text, TTS
- **Chat**: Conversation + message storage, OpenAI chat completions
- **Image**: AI image generation via `gpt-image-1`
- **Batch**: Concurrent rate-limited processing with retries for bulk AI tasks
- All use `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables

### Build & Production
- `script/build.ts`: Runs Vite build (frontend → `dist/public/`) then esbuild (server → `dist/index.cjs`), bundling a curated allowlist of server deps for cold-start performance
- Static files served by Express in production via `server/static.ts`

---

## External Dependencies

| Dependency | Purpose |
|---|---|
| **PostgreSQL** | Primary relational database (requires `DATABASE_URL` env var) |
| **Drizzle ORM** | Type-safe SQL query builder and migration tool |
| **OpenAI API** (via Replit AI Integrations) | Recipe discovery, extraction from URLs, voice features, image generation |
| **cheerio** | Server-side HTML scraping for recipe URL import |
| **@tanstack/react-query** | Client-side data fetching and cache management |
| **shadcn/ui + Radix UI** | Accessible, unstyled UI primitives |
| **framer-motion** | Animations and transitions |
| **wouter** | Lightweight client-side routing |
| **react-hook-form + zod** | Form state and validation |
| **date-fns** | Date formatting for weekly plans |
| **connect-pg-simple** | PostgreSQL-backed session storage (available, not yet wired for auth) |
| **Vite + tsx** | Frontend bundler and TypeScript dev runner |
| **Replit vite plugins** | Runtime error overlay, cartographer, dev banner (dev only) |

### Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI-compatible API key for Replit AI features
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Base URL for Replit's AI proxy