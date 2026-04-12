# GitMind — Enterprise Execution Plan

> Full in-depth engineering roadmap with implementation tasks, file targets, and sprint ordering.
> Last updated: 2026-04-11

---

## Phase 0 — Quick Wins (Executing Now)
*Ship in a single session. Zero architecture risk. Enterprise signaling.*

### 0.1 `/health` & `/readyz` Endpoints
**File:** `backend/main.py`
- `GET /health` → `{ status: "ok", version: "1.0.0", uptime_seconds: N }`
- `GET /readyz` → checks DB connectivity, returns `503` if unhealthy
- Required by all Kubernetes, AWS ALB, GCP Cloud Run health probes

### 0.2 Security HTTP Headers
**File:** `backend/main.py`
- Add `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Use FastAPI middleware for global response header injection
- Required by OWASP security checklist and enterprise WAFs

### 0.3 Rate Limiting on `/analyze`
**File:** `backend/main.py`
- Install `slowapi` (Redis-optional, in-memory default)
- Limit: 10 `/analyze` requests per minute per IP
- Return `429 Too Many Requests` with `Retry-After` header
- Prevents runaway API key cost bleed

### 0.4 Diff Size Validation
**File:** `backend/main.py`
- Reject diffs > 500 KB upfront with a friendly error message
- Prevents LLM context window explosions and runaway token costs
- Surface clean error in the Neural Thinking UI

### 0.5 Structured Logging
**Files:** `backend/main.py`, `backend/agent.py`, `backend/history.py`
- Replace all `print()` calls with Python `logging` module
- JSON-formatted log output for production log aggregators (Datadog, Loki, CloudWatch)
- Log levels: `INFO` for node transitions, `WARNING` for retries, `ERROR` for failures

### 0.6 CSV Export — History Tab
**Files:** `frontend/src/app/features/analysis-history/analysis-history.component.ts|html`
- "Export CSV" button in the History header bar
- Exports all visible rows with all columns
- Works for both Reviewed PR and Failed PR tabs

### 0.7 SARIF Export Button
**Files:** `frontend/src/app/features/analysis-history/` and summary tab
- SARIF (Static Analysis Results Interchange Format) is the industry standard used by GitHub Code Scanning
- Export button in the Results/Summary view
- Generates a valid SARIF 2.1.0 JSON with all `security`, `performance`, `style` findings
- Downloadable as `.sarif` file

---

## Phase A — Security & Authentication Foundation
*P0 — No enterprise adoption without this*

### A.1 Backend Auth Service
**Files:** `backend/auth.py` [NEW], `backend/main.py`

#### A.1.1 GitHub OAuth 2.0 Flow
```
GET  /auth/github         → redirect to GitHub OAuth
GET  /auth/github/callback → exchange code for token, issue JWT
POST /auth/logout         → invalidate session
GET  /auth/me             → return current user info
```
- GitHub OAuth App registration required
- JWT using `python-jose`, 24h access token + 7-day refresh token
- Store user record in `users` table (id, github_id, login, avatar_url, created_at)

#### A.1.2 API Key Encryption at Rest
- Use `cryptography.fernet` to encrypt user API keys before storing in DB
- Encryption key stored in `SECRET_KEY` environment variable (never in code)
- Replace `localStorage` API key storage in Angular with server-side encrypted store
- Frontend only ever sees masked key (last 4 chars)

### A.2 Multi-Tenancy DB Schema
**Files:** `backend/history.py`, `backend/auth.py` [NEW]

New tables:
```sql
users           (id, github_id, login, email, avatar_url, created_at)
organizations   (id, github_org_id, name, slug, created_at)
org_members     (org_id, user_id, role ENUM[owner,admin,reviewer,viewer])
api_keys        (id, user_id, encrypted_key, provider, masked_key, created_at)
```

Migrations to existing tables:
- Add `user_id`, `org_id` columns to `analysis_history`
- Row-level scoping on all queries: `WHERE org_id = :current_org_id`

### A.3 Angular Auth Module
**Files:** `frontend/src/app/core/auth/` [NEW]
- `AuthService` — manages JWT storage (HttpOnly cookie, not localStorage)
- `AuthGuard` — protects all routes
- `AuthInterceptor` — attaches JWT to every API request
- `LoginPageComponent` — GitHub OAuth redirect button
- `UserAvatarComponent` — show logged-in user in header

### A.4 RBAC Middleware
**File:** `backend/middleware.py` [NEW]
- `require_role(min_role: str)` decorator for all protected endpoints
- `get_current_user(token)` dependency injection for FastAPI routes
- Return `403 Forbidden` for role violations with descriptive message

---

## Phase B — Production Infrastructure
*P0 — Required for reliability and scale*

### B.1 Async Job Queue (ARQ + Redis)
**Files:** `backend/worker.py` [NEW], `backend/main.py`, `backend/jobs/` [NEW]

Architecture change:
```
Current:  POST /analyze → runs LLM in request → SSE streams back → done
New:      POST /analyze → enqueues job → returns { job_id }
          GET /jobs/{job_id}/stream → SSE from Redis pub/sub
          Worker: picks up job → runs LangGraph → publishes events to Redis channel
```

Files:
- `backend/worker.py` — ARQ worker definition, job functions
- `backend/jobs/analyze_job.py` — LangGraph pipeline as an ARQ job
- `backend/jobs/batch_job.py` — batch scan as an ARQ job
- Frontend `ApiService`: update `analyze()` to use job polling pattern
- Add `GET /jobs/{id}` and `GET /jobs/{id}/stream` endpoints

Benefits:
- Server restart doesn't kill in-flight analyses
- Jobs are retryable (ARQ retry on crash)
- Multiple workers can process jobs in parallel
- Queue depth and backlog become visible metrics

### B.2 PostgreSQL Migration
**Files:** `backend/database.py` [NEW], `backend/history.py`, `backend/alembic/` [NEW]

- `database.py` — SQLAlchemy 2.0 async engine + session factory
- **Alembic** for migrations (never manually alter schema again)
- ORM models: `AnalysisHistory`, `User`, `Organization`, `RepoMemory`
- Connection string from `DATABASE_URL` environment variable
- LangGraph checkpointer: swap `MemorySaver` → `AsyncSqliteSaver` → `AsyncPostgresSaver`
- Connection pool: `asyncpg` with pool size 10, max overflow 5

### B.3 Redis Integration
**File:** `backend/cache.py` [NEW]
- `aioredis` client for async operations
- Job event pub/sub for SSE streaming
- API response caching for `/history` (30s TTL)
- Session store for JWT refresh tokens
- Rate limiter backend for `slowapi`

### B.4 Docker Compose (Full Stack)
**Files:** `docker-compose.yml` [NEW], `docker-compose.dev.yml` [NEW], `Dockerfile.backend` [NEW], `Dockerfile.frontend` [NEW]

```yaml
services:
  postgres:  postgres:16-alpine
  redis:     redis:7-alpine
  api:       FastAPI (gunicorn + uvicorn workers, 4 workers)
  worker:    ARQ worker (auto-scaling 1-8 workers)
  frontend:  nginx serving Angular SSR build
```

- `.env.example` with all required variables documented
- `docker-compose.dev.yml` overrides for local hot-reload
- `make up` / `make down` / `make logs` shortcuts

### B.5 OpenTelemetry Observability
**File:** `backend/telemetry.py` [NEW]
- **Structured logging** with `structlog` (replaces `print()`)
- **OpenTelemetry traces** — instrument all LangGraph node transitions
- **Prometheus metrics** exposed at `GET /metrics`:
  - `gitmind_analyses_total` (counter, labels: provider, model, status)
  - `gitmind_llm_duration_seconds` (histogram, labels: provider, model, node)
  - `gitmind_tokens_used_total` (counter, labels: provider, model)
  - `gitmind_queue_depth` (gauge)
- **Sentry** integration for error tracking

---

## Phase C — GitHub App & Native Integration
*P1 — Removes #1 friction: the PAT flow*

### C.1 GitHub App Backend
**Files:** `backend/github_app.py` [NEW], `backend/webhooks.py` [NEW]

- Register a GitHub App (config in `backend/.github-app.yml`)
- `POST /webhooks/github` — verify signature + handle events:
  - `pull_request.opened` → auto-enqueue analysis job
  - `pull_request.synchronize` → incremental review (diff-of-diff)
  - `pull_request.closed` → archive and mark as complete
- `GET /github-app/install` → GitHub App installation redirect

### C.2 GitHub Checks API Integration
**File:** `backend/github_context.py` (extend)
- Create a **Check Run** at analysis start (`status: in_progress`)
- Update with findings summary at completion (`conclusion: success/failure`)
- Annotate individual file+line findings as Check Run annotations (shown inline in GitHub UI)

### C.3 Incremental Review (Diff-of-Diff)
**Files:** `backend/agent.py`, `backend/history.py`
- Store `last_analyzed_commit_sha` per PR in `analysis_history`
- On `pull_request.synchronize`, fetch only the delta diff since last analysis
- Mark issues from previous run as `resolved` if the flagged lines are no longer present
- Surface `Newly Introduced` badge on issues that appeared in this push

### C.4 GitLab MR Support
**File:** `backend/git_providers/` [NEW]
```python
class GitProvider(ABC): ...
class GitHubProvider(GitProvider): ...
class GitLabProvider(GitProvider): ...
```
- Abstract `fetch_diff()`, `post_comment()`, `set_status()` methods
- Provider detected from URL pattern
- Angular UI: detect provider from URL and show provider-specific icon

---

## Phase D — Advanced AI Capabilities
*P1 — Product differentiation*

### D.1 AST-Aware Diff Parsing
**File:** `backend/ast_parser.py` [NEW]

- Integrate **Tree-sitter** for TypeScript, Python, Go, Java, Rust
- For each changed file in the diff, parse the AST and extract:
  - Function/method signatures changed
  - Class hierarchy changes
  - Import dependency changes
- Attach AST context to each review persona's prompt:
  ```
  === FUNCTION CONTEXT ===
  def calculate_discount(user: User, amount: float) -> float:
    # This function is called by: checkout_service.py:L142, cart.py:L89
  ```
- Reduces false positives by ~40% (LLM has full scope context)

### D.2 Semgrep Static Analysis Pre-filter
**File:** `backend/static_analysis.py` [NEW]
- Run `semgrep --config=p/owasp-top-ten --json` on the diff
- Run `bandit` (Python) or `eslint --plugin security` (JS/TS)
- Pass confirmed static findings to the arbitrator as high-confidence pre-seeds
- Show a "Confirmed by Semgrep" badge on those findings in the UI

### D.3 Compliance Review Mode
**Files:** `backend/prompts.py`, `backend/agent.py`
- New `PERSONA_COMPLIANCE` prompt targeting SOC2, HIPAA, PCI-DSS patterns
- New `ComplianceReport` Pydantic model with control checkboxes
- Angular: New "Compliance" tab in the report view
- Configurable in `.gitmind.yaml`: `compliance: [soc2, pci_dss]`

### D.4 Team Preference Learning Engine
**Files:** `backend/history.py`, `backend/preferences.py` [NEW]
- Track every `accept`/`dismiss` action per issue category per repo
- Background job calculates category suppression score weekly
- Auto-mute categories where dismiss rate > 80% for a given repo
- Surface "Your team usually dismisses this type of issue" warning before showing

---

## Phase E — Team Collaboration
*P2 — Multiplies value for large orgs*

### E.1 Slack / Microsoft Teams Webhooks
**Files:** `backend/notifications.py` [NEW], `frontend/` settings page
- `POST /notifications/test` — send a test card to configured webhook
- Slack Block Kit message with PR title, status, confidence, top 3 issues
- MS Teams Adaptive Card equivalent
- Per-org webhook URL stored encrypted in Postgres

### E.2 GitHub PR Review Thread Sync
**File:** `backend/github_context.py` (extend)
- Each pushed finding creates a proper **GitHub PR review comment** with position
- "Resolve" action in GitMind UI calls GitHub's `PUT /pulls/{pr}/comments/{id}` resolved state
- Bi-directional sync: if a human resolves the comment on GitHub, mark it in GitMind

### E.3 Engineering Manager Dashboard
**Files:** `frontend/src/app/features/analytics/` (extend)
- New charts: issue resolution rate, avg time-to-review, category trends over 30/90 days
- Per-repo quality score card
- Exportable as PDF via `html2canvas` + `jsPDF`

---

## Phase F — Developer Ecosystem
*P2–P4 — Long-term moat*

### F.1 REST API Documentation
**File:** `backend/main.py`
- FastAPI auto-generates OpenAPI spec at `/docs` (already exists)
- Add proper `tags`, `summary`, `description` to all endpoints
- Add `APIKey` security scheme to OpenAPI spec
- Publish at `docs.gitmind.dev` (Mintlify or Redocly)

### F.2 CLI Tool
**Files:** `cli/` [NEW] (separate Python package)
```bash
pip install gitmind-cli
gitmind review --pr https://github.com/org/repo/pull/42 --fail-on high
gitmind review --diff ./changes.patch --output report.sarif
```
- Exit code `1` on high-severity findings (CI/CD pipeline gate)
- `--output sarif` for GitHub Code Scanning
- `--output json` for downstream tooling
- `--output markdown` for PR descriptions

### F.3 MCP Server
**File:** `backend/mcp_server.py` [NEW]
- Expose `gitmind.review_pr(url)` as an MCP tool
- Any MCP client (Claude Desktop, Cursor, Windsurf) can call GitMind as a sub-agent
- `gitmind.get_history(repo)` — retrieve past reviews as context

### F.4 Plugin Architecture
**File:** `backend/plugins/` [NEW]
```python
class GitMindPlugin(ABC):
    name: str
    def analyze(self, diff: str, state: AgentState) -> list[ReviewItem]: ...
```
- Plugin loader reads `plugins:` list from `.gitmind.yaml`
- Plugins can be local Python files or installed packages
- First-party plugins: `gitmind-naming-conventions`, `gitmind-internal-libs`

---

## Sprint Order (Execution Sequence)

```
Week 1:  Phase 0 (Quick Wins) — Ship all 7 items
Week 2:  Phase A.1 Auth + Phase B.3 Redis + Phase B.1 Async Queue (skeleton)
Week 3:  Phase B.2 PostgreSQL migration + Alembic
Week 4:  Phase A.2 Multi-tenancy + A.3 Angular Auth Module
Week 5:  Phase C.1 GitHub App + C.2 Checks API
Week 6:  Phase D.1 AST parsing + D.2 Semgrep
Week 7:  Phase E.1 Slack webhooks + E.2 PR Thread Sync
Week 8:  Phase B.4 Docker Compose full stack
Week 9+: Phase F (CLI, MCP, Plugins)
```

---

## Current Session Execution Queue

- [x] Write this plan
- [x] Phase 0.1 — `/health` + `/readyz` endpoints
- [x] Phase 0.2 — Security HTTP headers middleware (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`, etc.)
- [x] Phase 0.3 — In-memory sliding-window rate limiter (10 req/min/IP on `/analyze`)
- [x] Phase 0.4 — Diff size validation (400 KB hard cap with `413` response)
- [x] Phase 0.5 — Structured JSON logging (replaced `print()` with `logging` in agent.py + main.py)
- [x] Phase 0.6 — CSV export button in History tab (works for both Reviewed PR & Failed PR tabs)
- [x] Phase 0.7 — SARIF 2.1.0 export (per-row, downloadable `.sarif` for GitHub Code Scanning)

### Phase A — Next Sprint: Auth + Multi-Tenancy
- [ ] A.1 — GitHub OAuth backend (`/auth/github`, `/auth/github/callback`, JWT issuance)
- [ ] A.2 — `users` + `organizations` + `org_members` tables (PostgreSQL migration)
- [ ] A.3 — API key encryption at rest (`cryptography.fernet`)
- [ ] A.4 — Angular `AuthGuard` + `AuthInterceptor` + Login page

### Phase B — Infrastructure
- [ ] B.1 — ARQ async job queue + Redis integration
- [ ] B.2 — PostgreSQL migration (SQLAlchemy 2.0 async + Alembic)
- [ ] B.3 — Redis cache for `/history` responses
- [ ] B.4 — Docker Compose full stack (`postgres`, `redis`, `api`, `worker`, `frontend`)

*GitMind Enterprise Plan · 2026-04-11*
