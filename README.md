# SRE Copilot — Phase 1: Deployment Foundation

An enterprise SRE/DevOps platform engineered to orchestrate and track application deployments across Kubernetes clusters with real-time audit logging and health visibility.

---

## 🎨 Design System & Theme

Designed according to a **minimalist dark aesthetic**:
- **Base Canvas:** Deep blacks, obsidian surfaces, and high-contrast white typography (`#0a0a0a`, `#111111`, `#1a1a1a`).
- **Status Accents:**
  - 🟢 **Success / Healthy:** Vivid Emerald (`#22c55e`, `#4ade80`, bg `#0f2a1a`)
  - 🔴 **Failed / Error:** Crimson Red (`#ef4444`, `#f87171`, bg `#2a0f0f`)
  - 🟡 **Pending / Running:** Radiant Amber (`#f59e0b`, `#fbbf24`, bg `#2a1f0a`)
- **Typography:** `Inter` for modern interfaces and `JetBrains Mono` for Kubernetes identifiers, commit hashes, and log streams.

---

## 🏗 Architecture & Tech Stack

### Frontend (`/frontend`)
- **Framework:** React 19 + TypeScript + Vite 6
- **Styling:** Bespoke vanilla CSS tokens & utility design system (`src/index.css`)
- **Data & State:** TanStack React Query v5 (polling & cache invalidation) + React Router v7
- **Icons:** Lucide React
- **HTTP Client:** Axios with JWT request interceptor and 401 handling

### Backend (`/backend`)
- **Runtime:** Node.js 22 + TypeScript + Express
- **Database & ORM:** PostgreSQL 16 + Drizzle ORM
- **Authentication:** JWT + Argon2 password hashing
- **Deployment Providers:**
  - `MockDeploymentProvider`: Simulates Kubernetes rollout sequence with realistic delays and pod status logs (zero-dependency local development).
  - `KubernetesDeploymentProvider`: Direct rollout orchestration via official `@kubernetes/client-node`.
- **Validation:** Zod schemas with centralized error translation.

### Infrastructure (`/infrastructure`)
- **Docker:** Multi-stage Dockerfiles for frontend (Nginx) and backend (Node Alpine).
- **Docker Compose:** Full local orchestration (`postgres`, `backend`, `frontend`).
- **Kubernetes:** Production-ready manifests in `infrastructure/kubernetes/` (`namespace`, `postgres`, `backend`, `frontend`).

---

## 🚀 Quickstart

### Option A: Using Docker Compose (Recommended)

1. Start all containers (Postgres, Backend API, and Frontend):
   ```bash
   docker compose up --build
   ```

2. Open the frontend in your browser:
   ```
   http://localhost:8080
   ```
   Backend API is available at:
   ```
   http://localhost:3001/api/v1
   ```

---

### Option B: Local Development

#### 1. Start PostgreSQL
Run PostgreSQL using Docker:
```bash
docker compose up postgres -d
```
*(Or point `DATABASE_URL` in `backend/.env` to your local PostgreSQL instance).*

#### 2. Run Database Migrations & Seed
```bash
cd backend
npm install
npm run db:push
npm run db:seed
```
*Default Seed Credentials:*
- **Email:** `demo@example.com`
- **Password:** `Demo1234!`

#### 3. Start Backend Server
```bash
cd backend
npm run dev
```
API runs on `http://localhost:3001` (Health check: `http://localhost:3001/health`).

#### 4. Start Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Web console opens on `http://localhost:5173`.

---

## 📋 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new SRE engineer |
| `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT |
| `GET`  | `/api/v1/auth/me` | Fetch authenticated profile |
| `GET`  | `/api/v1/applications` | List registered applications |
| `POST` | `/api/v1/applications` | Register new Git repository |
| `GET`  | `/api/v1/applications/:id` | Get application details |
| `DELETE` | `/api/v1/applications/:id` | Delete application & environments |
| `GET`  | `/api/v1/applications/:appId/environments` | List environments for application |
| `POST` | `/api/v1/applications/:appId/environments` | Create Kubernetes environment |
| `DELETE` | `/api/v1/environments/:id` | Delete environment |
| `GET`  | `/api/v1/deployments` | List all deployments across platform |
| `GET`  | `/api/v1/deployments/dashboard` | Dashboard metrics and recent activity |
| `POST` | `/api/v1/environments/:envId/deployments` | Trigger a new deployment |
| `GET`  | `/api/v1/environments/:envId/deployments` | List deployments in environment |
| `GET`  | `/api/v1/deployments/:id` | Get deployment status & metadata |
| `GET`  | `/api/v1/deployments/:id/logs` | Fetch deployment execution logs |

---

## 🧪 Testing & Validation

```bash
# Typecheck backend
cd backend && npx tsc --noEmit

# Typecheck & build frontend bundle
cd frontend && npm run build

# Run backend unit & integration tests (requires PostgreSQL running)
cd backend && npm test
```
