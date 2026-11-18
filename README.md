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

## 📊 Grafana Dashboards & Observability (Phase 2.4)

SRE Copilot integrates Grafana with automated provisioning to deliver centralized dashboards for infrastructure health, runtime container/pod telemetry, and application performance monitoring (APM).

### 1. Starting Grafana Locally
Grafana is included in the Docker Compose configuration:
```bash
docker compose up -d grafana
```
- **Web UI:** `http://localhost:3000`
- **Default Local Credentials:**
  - **Username:** `admin` (or `${GRAFANA_ADMIN_USER}`)
  - **Password:** `admin` (or `${GRAFANA_ADMIN_PASSWORD}`)
- **Data Persistence:** Backed by the `sre_copilot_grafana_data` Docker volume.

### 2. Automated Provisioning
- **Datasource:** `infrastructure/grafana/provisioning/datasources/prometheus.yml` connects Grafana directly to the Prometheus service at `http://prometheus:9090`.
- **Dashboards Provider:** `infrastructure/grafana/provisioning/dashboards/dashboards.yml` monitors and auto-loads JSON dashboards from `/var/lib/grafana/dashboards`.

### 3. Available Dashboards
1. **Infrastructure Overview** (`infrastructure.json`, UID: `sre-copilot-infra`):
   - Prometheus server and backend target health (`up` metric)
   - Active monitored tenant applications count
   - Backend process CPU usage, Resident Set Size (RSS), and Node.js heap memory
   - Node.js event loop delay percentiles (p50, p99, max)
   - Prometheus TSDB head series count and scrape latencies
2. **Docker Runtime** (`docker-runtime.json`, UID: `sre-copilot-docker`):
   - Container running status, health probe status, uptime, and restart count
   - Real-time container CPU utilization (%)
   - Memory usage vs. configured limit and memory utilization (%)
   - Network throughput (RX / TX in Bps)
   - Block I/O read/write byte rates
   - Dynamic filters: `Application ID`, `Environment ID`, `Container`
3. **Kubernetes Runtime** (`kubernetes-runtime.json`, UID: `sre-copilot-k8s`):
   - Deployment replicas (desired, ready, available, unavailable)
   - Pod CPU usage (cores) and memory usage (bytes) via Metrics Server
   - Pod restart counts and uptime
   - Pod phase lifecycle and readiness status table
   - Dynamic filters: `Application ID`, `Environment ID`, `Namespace`, `Deployment`
4. **Application Performance Monitoring (APM)** (`application-apm.json`, UID: `sre-copilot-apm`):
   - HTTP throughput (RPS & RPM), latency percentiles (p50, p95, p99, average), error rate %
   - HTTP status code distribution (2xx, 4xx, 5xx)
   - Endpoint-level performance breakdown by method and normalized route
   - Database operations (query throughput, duration, slow queries >100ms, query failures by SQL verb)
   - External dependencies performance (Kubernetes API, Docker daemon, GitHub API, external HTTP)
   - Dynamic filter: `Application ID` (`app_id` attribution)

### 4. Adding a New Dashboard
To add a new dashboard:
1. Export or create the dashboard JSON schema.
2. Place the JSON file in `infrastructure/grafana/dashboards/<dashboard-name>.json`.
3. Set a unique `uid` (e.g. `sre-copilot-<name>`) and ensure queries use datasource `{"type": "prometheus", "uid": "Prometheus"}`.
4. Grafana auto-provisions the dashboard within 15 seconds.

### 5. Metric Availability & Limitations
- **Attribution Model:** Platform management requests use `app_id="sre-copilot-backend"`, while tenant workload requests are attributed to their application ID via `x-application-id`.
- **Honest Telemetry:** Uninstrumented applications display explicit "No Data" or "Unavailable" states rather than fabricated zeroes.
- **Metrics Server Dependency:** Pod CPU and memory in Kubernetes require `metrics-server` on the cluster. If unavailable, panels display "Metrics Server Unavailable" without crashing.
- **Basic SRE Profile:** Basic SRE environments operate completely independently without requiring Prometheus or Grafana.

### 6. Production Security Considerations
- **Credentials:** Set strong credentials via `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` in your production `.env` or secret manager.
- **Anonymous Access:** Disabled by default (`GF_AUTH_ANONYMOUS_ENABLED=false`).
- **User Registration:** Disabled by default (`GF_USERS_ALLOW_SIGN_UP=false`).
- **Network Isolation:** In production, restrict Grafana port `3000` to internal VPN or reverse proxy with SSO / OAuth (e.g. GitHub/Google OAuth or Okta via Grafana auth configuration).

---

## 🧪 Testing & Validation

```bash
# Typecheck backend
cd backend && npx tsc --noEmit

# Typecheck & build frontend bundle
cd frontend && npm run build

# Run backend unit & integration tests (requires PostgreSQL running)
cd backend && npm test

# Run real Kubernetes kind integration suite
cd backend && npm run test:k8s
```
