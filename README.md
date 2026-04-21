# 🤖 GitMind: The Autonomous Cognitive Code Sentinel

<p align="center">
  <img src="./image1.png" width="90%" alt="GitMind Dashboard" style="border-radius: 24px; box-shadow: 0 20px 80px rgba(139, 92, 246, 0.4);">
</p>

[![LangGraph](https://img.shields.io/badge/LangGraph-v0.2-blue.svg?style=for-the-badge&logo=langchain)](https://github.com/langchain-ai/langgraph)
[![Angular 19](https://img.shields.io/badge/Angular-19.1-dd0031.svg?style=for-the-badge&logo=angular)](https://angular.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Latest-009688.svg?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![DeepSeek](https://img.shields.io/badge/Reasoning-DeepSeek--R1-purple.svg?style=for-the-badge)](https://deepseek.com/)

**GitMind** is an enterprise-grade **Autonomous DevOps Engine** that transforms traditional code reviews into a multi-agent cognitive process. Orchestrated by **LangGraph**, GitMind doesn't just scan for syntax—it reasons through architectural implications, identifies deep security vulnerabilities, and synthesizes production-ready remediation patches through a self-correcting feedback loop.

---

## ⚡ Cognitive Architecture: Beyond Static Analysis

GitMind eliminates the volatility of "one-shot" AI responses by leveraging a **Cyclic Multi-Agent System**:

- **🧠 Triple-Pass Arbitration:** Simultaneous review by independent **Security Auditors**, **Performance Engineers**, and **Style Guardians**, synthesized by a senior **Arbitrator** to eliminate hallucinations.
- **🛠️ Autonomous Remediation:** Not just comments—GitMind generates **atomic code patches**, **exhaustive unit test suites**, and **Mermaid.js architecture diagrams** in any PR context.
- **✋ State-Persistence HITL:** Checkpointing via **SQLite** allows the agentic graph to pause for "Human-in-the-Loop" feedback, refining its logic based on direct developer steering.
- **🚀 Neural HUD Interface:** A zoneless **Angular 19 Signals** architecture delivers a real-time, high-fidelity experience with sub-millisecond reactivity.

---

## 💎 Technical Pillars

| Pillar | Capability | Intelligence Layer |
| :--- | :--- | :--- |
| **Security Sentinel** | Scans for SQLi, XSS, Secret Leaks, and SSRF pattern matching. | DeepSeek-R1 / GPT-4o |
| **Performance Audit** | Detects memory leaks, N+1 queries, and O(n^2) complexity bottlenecks. | Claude 3.7 Sonnet |
| **Auto-Remediation** | Generates production-ready patches with direct GitHub push integration. | Gemini 1.5 Pro |
| **Semantic Cache** | Instant retrieval for identical code patterns across PR history. | SHA-256 Vector Hashing |
| **Architecture RAG** | Synthesizes Mermaid.js dependency graphs from raw file diffs. | LangGraph Arch-Node |

---

## 🧠 The Orchestration Pipeline

The GitMind brain is a **Cyclic Directed Acyclic Graph (DAG)** that facilitates non-linear reasoning and iterative refinement.

```mermaid
graph TD
    Start((●)) --> Ingest[📥 Context Ingestion]
    Ingest --> DP[🔍 Concurrent Review]
    DP --> Arb[🔀 Cognitive Arbitrator]
    Arb --> Enhance[🚀 Agentic Enhance]
    Enhance --> Critique[🧠 Autonomous Critique]
    Critique --> HITL[✋ Human Steering]
    
    HITL -- "Refinement Loop" --> Refiner[🔄 Recursive Refine]
    Refiner --> Critique
    
    HITL -- "Consensus" --> Save[💾 History Ledger]
    Save --> End((🏁 Final Report))
```

---

## 🛠 Project Blueprint

```text
GitMind/
├── backend/                # Intelligence Layer (Python 3.11+)
│   ├── agent.py            # LangGraph Orchestration & 8-node logic
│   ├── auto_fix.py         # Patch Synthesis & Staging Engine
│   ├── arch_review.py      # Mermaid Diagram Synthesis Node
│   ├── history.py          # SQLite persistence & Audit Ledger
│   └── main.py             # FastAPI Streaming & SSE Hub
├── frontend/               # Presentation Layer (Angular 19)
│   ├── src/app/features/   # Signals-based Component Modules
│   ├── src/styles.css      # Neural Glass UI Design System
│   └── public/             # High-impact Assets
└── README.md               # Sentinel Manifest
```

---

## ⚙️ Deployment & Synergy

### 1. Environment Configuration
Create a `.env` in the `backend/` directory:
```env
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
GITHUB_TOKEN=your_pat
```

### 2. Launch Sequence
```bash
# Start the Core Intelligence (Terminal 1)
cd backend && pip install -r requirements.txt && python main.py

# Start the Reactive HUD (Terminal 2)
cd frontend && npm install && npm start
```

---

## 🗺 Strategic Roadmap

- [x] **Phase I:** LangGraph Core & Multi-Node Arbitration.
- [x] **Phase II:** Agentic Auto-Fixes & GitHub Checkpoint API.
- [x] **Phase III:** Semantic Caching & Per-User History Ledger.
- [ ] **Phase IV:** OAuth2 Federated Identity & Team Workspace Analytics.
- [ ] **Phase V:** Local RAG indexing for full-codebase cross-referencing.

- [ ] ---

## 🏗️ System Architecture

### High-Level System Architecture

```mermaid
flowchart TB
    subgraph GitHub["🌐 GitHub Platform"]
        GH_PR[Pull Request]
        GH_API[GitHub API]
        GH_HOOK[Webhooks]
    end

    subgraph Nginx["🛡️ Nginx Reverse Proxy"]
        NGINX[Nginx Server<br/>Load Balancer & SSL]
    end

    subgraph Frontend["🖥️ Frontend Layer - Angular 19+"]
        ANG[Angular 19+<br/>Zoneless Signals]
        SSR[SSR Node Server<br/>Express]
        MERMAID[Mermaid.js<br/>Diagram Renderer]
        HIGHLIGHT[Highlight.js<br/>Syntax Highlighter]
    end

    subgraph Backend["🧠 Backend Intelligence Layer - Python 3.11+"]
        API[FastAPI<br/>Async REST + SSE]
        AGENT[LangGraph Agent<br/>Orchestration Engine]
        AUTH[Auth Service<br/>JWT + OAuth2]
        CACHE[Semantic Cache<br/>SHA-256 + Redis]
    end

    subgraph Workers["⚙️ Background Workers"]
        ARQ[ARQ Worker<br/>Async Task Queue]
        ANALYZE[Analysis Pipeline<br/>LangGraph DAG]
    end

    subgraph Data["💾 Data Layer"]
        POSTGRES[PostgreSQL<br/>Async SQLAlchemy + Alembic]
        REDIS[Redis<br/>Pub/Sub + Cache + Queue]
        SQLITE[SQLite<br/>HITL Checkpointing]
    end

    subgraph LLMs["🤖 Multi-LLM Intelligence Layer"]
        DEEPSEEK[DeepSeek-R1<br/>Security Sentinel]
        GPT4O[GPT-4o / o1<br/>Security + Review]
        CLAUDE[Claude 3.7 Sonnet<br/>Performance Audit]
        GEMINI[Gemini 1.5 Pro<br/>Auto-Remediation]
    end

    GH_PR --> GH_HOOK
    GH_HOOK --> NGINX
    GH_API --> NGINX

    NGINX --> ANG
    NGINX --> API

    ANG --> API
    ANG --> SSR
    ANG --> MERMAID
    ANG --> HIGHLIGHT

    API --> AGENT
    API --> AUTH
    API --> CACHE
    API --> POSTGRES
    API --> REDIS

    AGENT --> ARQ
    AGENT --> ANALYZE

    ARQ --> ANALYZE
    ANALYZE --> POSTGRES
    ANALYZE --> REDIS
    ANALYZE --> SQLITE

    ANALYZE --> DEEPSEEK
    ANALYZE --> GPT4O
    ANALYZE --> CLAUDE
    ANALYZE --> GEMINI

    ANALYZE -.->|patches| GH_API
    API -.->|results| ANG
```

---

### Agentic Orchestration Pipeline (LangGraph DAG)

```mermaid
flowchart TD
    Start([🚀 PR Triggered]) --> Ingest

    subgraph Ingestion["📥 Context Ingestion Layer"]
        Ingest[Fetch GitHub Diff<br/>via API]
        Enrich[Enrich with<br/>Repo Context]
        Config[Load .gitmind.yml<br/>Config]
        Token[Token Optimization<br/>Deduplication]
    end

    subgraph Review["🔍 Multi-Agent Review Layer"]
        Security[🔐 Security Sentinel<br/>SQLi, XSS, SSRF, Secrets<br/>DeepSeek-R1 / GPT-4o]
        Perf[⚡ Performance Engineer<br/>Memory Leaks, N+1, O(n2)<br/>Claude 3.7 Sonnet]
        Style[🎨 Style Guardian<br/>SOLID, PEP8, Code Quality<br/>GPT-4o]
    end

    subgraph Arbitrate["🧠 Arbitration & Synthesis"]
        Arb[Senior Arbitrator<br/>Synthesize Findings<br/>Eliminate Hallucinations]
    end

    subgraph Critique["📊 Self-Critique Layer"]
        Crit[Critique Node<br/>Evaluate Review Quality<br/>Confidence Scoring]
    end

    subgraph Refine["🔄 Refinement Loop"]
        Ref[Refinement Node<br/>Iterative Improvement<br/>Based on Critique]
    end

    subgraph Remediate["🛠️ Auto-Remediation Layer"]
        Fix[Generate Atomic<br/>Code Patches<br/>Gemini 1.5 Pro]
        Test[Synthesize Unit &<br/>Integration Tests]
        Arch[Generate Mermaid.js<br/>Architecture Diagrams]
    end

    subgraph HITL["✋ Human-in-the-Loop"]
        Checkpoint[SQLite Checkpoint<br/>Pause for Human Feedback]
        Steer[Developer Steering<br/>Focus & Severity Control]
    end

    subgraph Output["📤 Output Layer"]
        Report[Review Report<br/>Confidence Scores]
        PR_Comment[GitHub PR<br/>Comments Posted]
        Commit[Atomic Commits<br/>to PR Branch]
        Cache[Semantic Cache<br/>SHA-256 Store]
    end

    Ingest --> Enrich
    Enrich --> Config
    Config --> Token

    Token --> Security
    Token --> Perf
    Token --> Style

    Security --> Arb
    Perf --> Arb
    Style --> Arb

    Arb --> Crit

    Crit -->|needs improvement| Ref
    Ref --> Arb

    Crit -->|approved| Fix

    Fix --> Test
    Fix --> Arch

    Fix --> Checkpoint
    Checkpoint -->|human feedback| Steer
    Steer --> Ref

    Test --> Report
    Arch --> Report

    Report --> PR_Comment
    Report --> Commit
    Report --> Cache

    Cache -.->|instant retrieval| Token
```

---

### Data Flow Architecture (Request Lifecycle)

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant FE as Angular Frontend
    participant NG as Nginx Proxy
    participant API as FastAPI
    participant QUEUE as Redis/ARQ Queue
    participant WORKER as LangGraph Worker
    participant LLM as Multi-LLM Layer
    participant DB as PostgreSQL
    participant CACHE as Redis Cache
    participant GH as GitHub API

    Dev->>FE: Opens GitMind Dashboard
    FE->>NG: Request Dashboard
    NG->>FE: Serve Angular App

    Dev->>FE: Submits PR URL for Analysis
    FE->>NG: POST /analyze {pr_url}
    NG->>API: Forward Request

    API->>CACHE: Check SHA-256 Cache
    alt Cache Hit
        CACHE-->>API: Return cached results
        API-->>FE: SSE Stream Results
    else Cache Miss
        API->>QUEUE: Enqueue Analysis Job
        API-->>FE: Return job_id
        FE->>NG: GET /jobs/{id}/stream
        NG->>API: SSE Connection

        QUEUE->>WORKER: Pick up Job

        WORKER->>GH: Fetch PR Diff
        GH-->>WORKER: Return File Diffs
        WORKER->>GH: Fetch PR Context
        GH-->>WORKER: Return Comments & History

        WORKER->>LLM: Security Review (DeepSeek/GPT-4o)
        LLM-->>WORKER: Security Findings

        WORKER->>LLM: Performance Review (Claude 3.7)
        LLM-->>WORKER: Performance Findings

        WORKER->>LLM: Style Review (GPT-4o)
        LLM-->>WORKER: Style Findings

        WORKER->>WORKER: Arbitrate & Synthesize
        WORKER->>WORKER: Self-Critique Loop

        loop Refinement
            WORKER->>LLM: Refine Findings
            LLM-->>WORKER: Improved Results
        end

        WORKER->>LLM: Generate Code Patches (Gemini 1.5 Pro)
        LLM-->>WORKER: Atomic Patches

        WORKER->>LLM: Generate Mermaid Diagrams
        LLM-->>WORKER: Architecture Diagrams

        WORKER->>DB: Store Analysis History
        WORKER->>CACHE: Store Semantic Cache

        WORKER->>GH: Post PR Comments
        GH-->>WORKER: Comments Posted

        WORKER->>API: Publish Results via Redis Pub/Sub
        API-->>FE: SSE Stream Results
    end

    Dev->>FE: Review and Accept Fixes
    FE->>API: Accept Patches
    API->>GH: Push Atomic Commits
    GH-->>API: Commits Applied
    API-->>FE: Confirmation
```

---

### Infrastructure & Deployment Architecture

```mermaid
flowchart TB
    subgraph Cloud["☁️ Cloud Infrastructure"]
        subgraph LB["🌐 Load Balancer"]
            ALB[AWS ALB / Azure LB]
        end

        subgraph FrontendCluster["🖥️ Frontend Cluster"]
            FE1[Angular SSR Pod 1]
            FE2[Angular SSR Pod 2]
        end

        subgraph BackendCluster["🧠 Backend Cluster"]
            API1[FastAPI Pod 1]
            API2[FastAPI Pod 2]
        end

        subgraph WorkerCluster["⚙️ Worker Cluster"]
            W1[LangGraph Worker 1]
            W2[LangGraph Worker 2]
            W3[LangGraph Worker N]
        end
    end

    subgraph DataCluster["💾 Data Cluster"]
        PG_PRIMARY[PostgreSQL Primary<br/>Async SQLAlchemy]
        PG_REPLICA[PostgreSQL Replica<br/>Read Queries]
        REDIS_MASTER[Redis Master<br/>Queue + Pub/Sub]
        REDIS_REPLICA[Redis Replica<br/>Cache]
    end

    subgraph External["🌍 External Services"]
        GITHUB[GitHub API]
        DEEPSEEK[DeepSeek API]
        OPENAI[OpenAI API]
        ANTHROPIC[Anthropic API]
        GOOGLE[Google AI API]
    end

    subgraph Observability["📊 Observability Stack"]
        OT[OpenTelemetry<br/>Distributed Tracing]
        PROM[Prometheus<br/>Metrics]
        GRAF[Grafana<br/>Dashboards]
        SENTRY[Sentry<br/>Error Tracking]
    end

    Internet((🌐 Internet)) --> ALB

    ALB --> FE1
    ALB --> FE2
    ALB --> API1
    ALB --> API2

    FE1 --> API1
    FE2 --> API2

    API1 --> W1
    API2 --> W2

    W1 --> PG_PRIMARY
    W2 --> PG_PRIMARY

    W1 --> REDIS_MASTER
    W2 --> REDIS_MASTER

    W1 --> GITHUB
    W1 --> DEEPSEEK
    W1 --> OPENAI
    W1 --> ANTHROPIC
    W1 --> GOOGLE

    W2 --> GITHUB
    W2 --> DEEPSEEK
    W2 --> OPENAI
    W2 --> ANTHROPIC
    W2 --> GOOGLE

    PG_PRIMARY -.replicate.-> PG_REPLICA
    REDIS_MASTER -.replicate.-> REDIS_REPLICA

    API1 --> OT
    API2 --> OT
    W1 --> OT
    W2 --> OT

    OT --> PROM
    PROM --> GRAF
    W1 --> SENTRY
    W2 --> SENTRY
```

---

### Technology Stack Mindmap

```mermaid
mindmap
  root((GitMind
  Tech Stack))
    Backend
      FastAPI
      Python 3.11+
      Uvicorn + Gunicorn
      LangGraph
      LangChain
      SQLAlchemy Async
      PostgreSQL
      Redis
      SQLite
      Alembic
      ARQ
      PyJWT
      DotEnv
      StructLog
      Tenacity
    Frontend
      Angular 19+
      Zoneless Signals
      Angular SSR
      Express
      RxJS 7.8
      TypeScript 5.8
      Mermaid.js
      Highlight.js
      Marked
      DOMPurify
    AI Models
      DeepSeek-R1
      GPT-4o / o1
      Claude 3.7 Sonnet
      Gemini 1.5 Pro
    DevOps
      Docker
      Docker Compose
      Nginx
      Kubernetes
      Helm Charts
      Terraform
    Observability
      OpenTelemetry
      Prometheus
      Grafana
      Sentry
      LangSmith
    Security
      JWT Auth
      GitHub OAuth2
      Pydantic
      Cryptography
      DLP Layer
```

---

### Database Schema Architecture

```mermaid
erDiagram
    USERS ||--o{ ORG_MEMBERS : belongs_to
    ORGANIZATIONS ||--o{ ORG_MEMBERS : has
    ORGANIZATIONS ||--o{ API_KEYS : owns
    ORGANIZATIONS ||--o{ ANALYSIS_HISTORY : owns
    USERS ||--o{ ANALYSIS_HISTORY : creates
    USERS ||--o{ API_KEYS : owns

    USERS {
        uuid id PK
        string email UK
        string github_id UK
        string username
        datetime created_at
    }

    ORGANIZATIONS {
        uuid id PK
        string name UK
        string slug UK
        string plan
    }

    ORG_MEMBERS {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        string role
        datetime joined_at
    }

    API_KEYS {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        string key_hash UK
        string last_four
        boolean active
    }

    ANALYSIS_HISTORY {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        string pr_url
        string repo_name
        jsonb findings
        float confidence_score
        int token_count
        int token_saved
        string status
        datetime created_at
    }
```

---

### Network Topology & Security Layers

```mermaid
flowchart TB
    subgraph DMZ["🛡️ DMZ - Perimeter Security"]
        WAF[WAF / OWASP Rules<br/>Rate Limiting 10/min]
        NGINX[Nginx<br/>SSL Termination<br/>CSP Headers]
    end

    subgraph Internal["🔒 Internal Network (VPC)"]
        subgraph AppLayer["📦 Application Layer"]
            FE_POD[Frontend SSR Pods<br/>Express + Angular]
            API_POD[FastAPI Pods<br/>Gunicorn + Uvicorn]
        end

        subgraph WorkerLayer["⚙️ Worker Layer"]
            WORKER_POD[LangGraph Workers<br/>ARQ Workers]
        end

        subgraph DataLayer["💾 Data Layer"]
            PG[PostgreSQL<br/>Port 5432]
            REDIS[Redis<br/>Port 6379]
        end
    end

    subgraph ExternalAPIs["🌍 External APIs"]
        GH[GitHub API<br/>HTTPS 443]
        AI[AI Providers<br/>DeepSeek/OpenAI/Claude/Gemini]
    end

    subgraph SecurityControls["🔐 Security Controls"]
        JWT[JWT Validation<br/>Role Checks]
        DLP[DLP Layer<br/>PII Scrubbing]
        ENCRYPT[Encryption<br/>AES-256 at Rest<br/>TLS 1.3 in Transit]
    end

    Internet((🌐 Internet)) --> WAF
    WAF --> NGINX
    NGINX --> FE_POD
    NGINX --> API_POD

    FE_POD --> API_POD
    API_POD --> WORKER_POD
    WORKER_POD --> PG
    WORKER_POD --> REDIS
    WORKER_POD --> GH
    WORKER_POD --> AI

    API_POD -.JWT Validation.-> JWT
    API_POD -.DLP Check.-> DLP
    PG -.Encryption.-> ENCRYPT
    REDIS -.Encryption.-> ENCRYPT

    style DMZ fill:#ffcccc
    style Internal fill:#ccffcc
    style SecurityControls fill:#ccccff
```

---

> **Built with** LangGraph, Angular 19, FastAPI, PostgreSQL, Redis, and a Multi-LLM orchestration engine — engineered for the high-velocity engineering teams of tomorrow.

---
*Built for the high-velocity engineering teams of tomorrow.*
