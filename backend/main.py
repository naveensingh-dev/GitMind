import json
import asyncio
import uuid
import re
import httpx
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks, Response, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from agent import app_graph, fetch_github_diff_text
from schemas import AgentState, ReviewItem, ReviewReport
from pydantic import BaseModel, ValidationError
from history import (
    save_analysis, get_history, get_analysis_by_id, 
    add_suppression, get_suppressed_issues, get_cached_analysis, 
    queue_repo_for_scan, update_scan_status
)
from auth import router as auth_router, require_auth, get_current_user, User
from database import init_db, engine
import worker

# ── Structured Logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "name": "%(name)s", "msg": %(message)s}',
    datefmt="%Y-%m-%dT%H:%M:%SZ"
)
logger = logging.getLogger("gitmind.api")
logging.getLogger("gitmind.history").setLevel(logging.DEBUG)
logging.getLogger("gitmind.agent").setLevel(logging.DEBUG)

# ── Constants ─────────────────────────────────────────────────────────────────
START_TIME = time.time()
VERSION = "1.0.0"
MAX_DIFF_BYTES = 500_000  # 500 KB hard limit on incoming diff payloads
MAX_REQUESTS_PER_MINUTE = 10  # Rate limit for /analyze

# ── In-memory rate limiter (per IP, per minute) ───────────────────────────────
rate_limit_store: dict = {}  # { ip: [timestamps] }

def check_rate_limit(client_ip: str) -> bool:
    """Simple in-memory sliding window rate limiter. Returns True if allowed."""
    now = time.time()
    window = 60  # 1 minute
    timestamps = rate_limit_store.get(client_ip, [])
    # Keep only timestamps within the current window
    timestamps = [t for t in timestamps if now - t < window]
    if len(timestamps) >= MAX_REQUESTS_PER_MINUTE:
        rate_limit_store[client_ip] = timestamps
        return False
    timestamps.append(now)
    rate_limit_store[client_ip] = timestamps
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes the database on application startup."""
    logger.info('"Initializing database..."')
    await init_db()
    logger.info('"Database initialized successfully."')
    yield

app = FastAPI(
    title="GitMind API",
    description="Enterprise AI Code Review Platform powered by LangGraph multi-agent pipeline",
    version=VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# ── Security Headers Middleware ────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "connect-src 'self' http://localhost:4200"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:4200"],
                   allow_credentials=True,
                   allow_methods=["*"],
                   allow_headers=["*"])

# ── Feature Routers ───────────────────────────────────────────────────────────
app.include_router(auth_router)

# ── Health Endpoints ──────────────────────────────────────────────────────────

@app.get("/health", tags=["Infrastructure"], summary="Liveness probe")
async def health_check():
    """Returns service health. Used by load balancers and Kubernetes liveness probes."""
    return {
        "status": "ok",
        "version": VERSION,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/readyz", tags=["Infrastructure"], summary="Readiness probe")
async def readiness_check():
    """Checks DB connectivity. Used by Kubernetes readiness probes."""
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready", "db": "ok", "type": "postgresql"}
    except Exception as e:
        logger.error('"DB readiness check failed: %s"', str(e))
        return JSONResponse(status_code=503, content={"status": "not_ready", "db": "error", "detail": str(e)})

# ── Job Queue Endpoints ───────────────────────────────────────────────────────

@app.post("/analyze/async", tags=["Analysis"], summary="Start an asynchronous analysis job")
async def analyze_async(request: Request, background_tasks: BackgroundTasks, user: dict = Depends(require_auth)):
    """
    Enterprise-grade async analysis. Enqueues the job and returns a job ID immediately.
    The actual analysis runs in the background or a separate worker.
    """
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not worker.HAS_ARQ and not check_rate_limit(client_ip):
         raise HTTPException(status_code=429, detail="Rate limit exceeded")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Construct state to validate
    try:
        AgentState(**data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    job_id = worker.create_job(data)
    
    # In dev mode (no ARQ/Redis), run via FastAPI BackgroundTasks
    if not worker.HAS_ARQ:
        background_tasks.add_task(worker.run_analysis_job, job_id, data)
    else:
        # In production, this would use arq.enqueue_job
        # For now, worker.py has a shim or we can add it here if needed
        # We'll stick to background tasks for the immediate dev-container transition
        background_tasks.add_task(worker.run_analysis_job, job_id, data)

    return {"job_id": job_id, "status": "queued"}

@app.get("/jobs/{job_id}", tags=["Jobs"])
async def get_job_status(job_id: str):
    job = worker.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/jobs/{job_id}/stream", tags=["Jobs"])
async def stream_job_events(job_id: str):
    """
    SSE stream for a specific job. 
    Clients can connect here to see the progress of an async job.
    """
    async def event_generator():
        last_event_idx = 0
        while True:
            job = worker.get_job(job_id)
            if not job:
                break
            
            # Send new events
            while last_event_idx < len(job["events"]):
                event = job["events"][last_event_idx]
                yield f"data: {json.dumps(event)}\n\n"
                last_event_idx += 1
            
            if job["status"] in ["completed", "failed"]:
                # Send final result if completed
                if job["status"] == "completed":
                    yield f"data: {json.dumps({'status': 'completed', 'result': job['result']})}\n\n"
                break
                
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class GithubCommentRequest(BaseModel):
    github_url: str
    item: ReviewItem
    github_token: str

@app.get("/fetch-diff")
async def fetch_github_diff(url: str):
    """Fetches raw diff from a GitHub PR or Commit URL."""
    if "github.com" not in url:
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported")

    diff = await fetch_github_diff_text(url)
    if diff:
        return {"diff": diff}
    
    raise HTTPException(status_code=404, detail="Failed to fetch diff. Ensure the URL is public and valid.")

def parse_github_url(url: str):
    """
    Extracts owner, repo, and identifier (pull number or commit SHA) from a GitHub URL.
    Supports both Pull Request URLs and individual Commit URLs.
    
    Returns:
        tuple: (owner, repo, pull_number, commit_sha)
    """
    # Pattern for Pull Requests: github.com/owner/repo/pull/number
    pr_match = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", url)
    if pr_match:
        owner, repo, pull_number = pr_match.groups()
        return owner, repo, pull_number, None
    
    # Pattern for Commits: github.com/owner/repo/commit/sha
    commit_match = re.search(r"github\.com/([^/]+)/([^/]+)/commit/([a-f0-9]+)", url)
    if commit_match:
        owner, repo, commit_sha = commit_match.groups()
        return owner, repo, None, commit_sha
        
    return None, None, None, None

async def get_latest_commit_sha(owner: str, repo: str, pull_number: str, token: str):
    """
    Queries the GitHub API to find the latest (head) commit SHA for a specific Pull Request.
    This is required for posting comments to the correct version of the code.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return response.json().get("head", {}).get("sha")
    return None

async def push_status_to_github(github_url: str, token: str, state: str, description: str, target_url: str = ""):
    """
    Updates the GitHub 'Commit Status' for the relevant commit.
    This provides visual feedback (checkmarks/crosses) directly on the GitHub UI.
    
    Args:
        state: One of 'pending', 'success', 'error', 'failure'
    """
    owner, repo, pull_number, commit_sha = parse_github_url(github_url)
    if not owner:
        return
    
    # If it's a PR, we need the latest SHA; otherwise use the direct commit SHA
    sha = commit_sha
    if pull_number:
        sha = await get_latest_commit_sha(owner, repo, pull_number, token)
    
    if not sha:
        return

    url = f"https://api.github.com/repos/{owner}/{repo}/statuses/{sha}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    payload = {
        "state": state,
        "description": description,
        "context": "GitMind Review",
        "target_url": target_url
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(url, headers=headers, json=payload)

@app.post("/analyze", tags=["Analysis"], summary="Start a PR code review analysis")
async def analyze_pr(request: Request, current_user: Optional[Dict] = Depends(get_current_user)):
    """
    Main entry point for starting a code review analysis.
    Streams events from the LangGraph agent back to the client using Server-Sent Events (SSE).
    Requires authentication — history is scoped per user.
    """
    # ── Authentication Check ──────────────────────────────────────────────────
    auth_header = request.headers.get("Authorization")
    
    # ── Rate limiting ──────────────────────────────────────────────────────────
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        logger.warning('"Rate limit exceeded for IP: %s"', client_ip)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 10 analyses per minute. Please wait before retrying.",
            headers={"Retry-After": "60"}
        )

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Use existing thread_id for state persistence or generate a new one
    thread_id = data.get("thread_id") or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    github_url = data.get("github_url")
    github_token = data.get("github_token")
    
    # Resolve authenticated user ID for per-user history scoping
    user_id = current_user.get("id") if current_user else None

    # Construct the initial agent state from request parameters
    try:
        initial_state = AgentState(
            diff=data.get("diff", ""),
            github_url=github_url,
            security_scan=data.get("security_scan", True),
            perf_analysis=data.get("perf_analysis", True),
            style_review=data.get("style_review", True),
            self_critique=data.get("self_critique", True),
            selected_provider=data.get("selected_provider", "gemini"),
            selected_model=data.get("selected_model", "gemini-1.5-flash"),
            api_key=data.get("api_key"),
            status="started"
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid state data: {str(e)}")

    # ── Diff size guard ───────────────────────────────────────────────────────────
    diff_size = len((initial_state.diff or "").encode("utf-8"))
    if diff_size > MAX_DIFF_BYTES:
        logger.warning('"Diff too large: %d bytes from IP %s"', diff_size, client_ip)
        raise HTTPException(
            status_code=413,
            detail=f"Diff payload is too large ({diff_size // 1024} KB). "
                   f"Maximum allowed is {MAX_DIFF_BYTES // 1024} KB. "
                   f"Consider splitting large PRs into smaller, focused changes."
        )

    logger.info('"Analysis started: provider=%s model=%s url=%s"', initial_state.selected_provider, initial_state.selected_model, github_url or "paste")


    diff_hash = hashlib.sha256(f"{initial_state.diff}_{initial_state.selected_provider}_{initial_state.selected_model}".encode()).hexdigest()

    async def event_generator():
        """Generator for Server-Sent Events."""
        yield f"data: {json.dumps({'thread_id': thread_id})}\n\n"
        
        # Post 'pending' status to GitHub if credentials provided
        if github_url and github_token:
            try:
                await push_status_to_github(github_url, github_token, "pending", "GitMind is analyzing the changes...")
            except Exception as e:
                print(f"DEBUG: Failed to push pending GitHub status: {e}")

        # --- CACHE INTERCEPTOR ---
        cached_analysis = await get_cached_analysis(diff_hash, initial_state.selected_model, initial_state.selected_provider)
        if cached_analysis and cached_analysis.get("review_data"):
            print(f"DEBUG: Cache HIT for {diff_hash}!")
            payload = {
                "node": "arbitrate",
                "status": "arbitrate_complete",
                "reviews": cached_analysis["review_data"],
                "monologue": ["⚡ Semantic Cache Hit! Returning instantly."],
                "tokens_saved": 0
            }
            yield f"data: {json.dumps(payload)}\n\n"
            
            # Auto-approve simulated github status
            if github_url and github_token:
                try:
                    await push_status_to_github(github_url, github_token, "success", "Analysis loaded from cache.")
                except Exception as e:
                    print(f"DEBUG: Failed to push cached GitHub status: {e}")
                
            try:
                await save_analysis(
                    github_url=github_url or "https://github.com/unknown/unknown",
                    model=initial_state.selected_model,
                    provider=initial_state.selected_provider,
                    review_report=cached_analysis["review_data"],
                    diff_hash=diff_hash,
                    diff_text=initial_state.diff,
                    api_key=initial_state.api_key,
                    github_token=github_token,
                    user_id=user_id
                )
                yield f"data: {json.dumps({'status': 'analysis_saved'})}\n\n"
            except Exception as e:
                print(f"DEBUG: Failed to save cached analysis history: {e}")
                
            return  # Stop execution completely
            
        try:
            final_reviews = None
            logger.info('"[STREAM] Starting LangGraph agent stream: thread=%s provider=%s model=%s"', thread_id, initial_state.selected_provider, initial_state.selected_model)
            # Stream events from the LangGraph agent
            async for event in app_graph.astream(initial_state.model_dump(), config=config):
                if not event:
                    continue
                    
                # Skip internal LangGraph interrupt signals
                if "__interrupt__" in event:
                    continue
                
                # Extract state update from the active node
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                logger.debug('"[STREAM] Node event received: node=%s status=%s"', node_name, state_update.get("status"))
                
                # Keep track of the final review report for GitHub status update
                if state_update.get("reviews"):
                    rev = state_update.get("reviews")
                    if isinstance(rev, dict):
                        final_reviews = ReviewReport(**rev)
                    else:
                        final_reviews = rev
                    logger.info('"[STREAM] Updated final_reviews from node=%s approval_status=%s"', node_name, final_reviews.approval_status)

                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "tokens_saved": state_update.get("tokens_saved", 0),
                    "monologue": state_update.get("monologue", []),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None,
                }
                
                # Also include enhancements if present in the payload for live updates
                # (Though they are now nested in 'reviews' too)
                if state_update.get("auto_fixes"):
                    payload["auto_fixes"] = state_update.get("auto_fixes").model_dump()
                if state_update.get("generated_tests"):
                    payload["generated_tests"] = state_update.get("generated_tests").model_dump()
                if state_update.get("arch_review"):
                    payload["arch_review"] = state_update.get("arch_review").model_dump()

                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05) # Small delay for smoother UI updates
            
            logger.info('"[STREAM] Agent stream complete. final_reviews=%s"', final_reviews.approval_status if final_reviews else 'None')
            
            # --- CONCLUDING TASKS (After stream loop) ---

            # 1. Finalize GitHub status based on review findings
            if github_url and github_token and final_reviews:
                high_sev = [i for cat in ['security', 'performance', 'style'] 
                           for i in getattr(final_reviews, cat) if i.severity == 'high']
                
                state = "failure" if high_sev else "success"
                desc = f"Found {len(high_sev)} high severity issues." if high_sev else "No high severity issues found."
                if final_reviews.approval_status == "approved" and not high_sev:
                    state = "success"
                elif final_reviews.approval_status == "rejected":
                    state = "failure"
                
                try:
                    await push_status_to_github(github_url, github_token, state, desc)
                except Exception as e:
                    print(f"DEBUG: Failed to push GitHub status: {e}")
            
            # 2. Phase 2: Auto-save analysis to history BEFORE final completion signal
            if final_reviews:
                logger.info('"[HISTORY] Attempting to save analysis: provider=%s model=%s url=%s status=%s"', initial_state.selected_provider, initial_state.selected_model, github_url or 'paste', final_reviews.approval_status)
                try:
                    partial_msg = "; ".join(final_reviews.partial_errors) if final_reviews.partial_errors else None
                    saved_id = await save_analysis(
                        github_url=github_url or "https://github.com/unknown/unknown",
                        model=initial_state.selected_model,
                        provider=initial_state.selected_provider,
                        review_report=final_reviews.model_dump(),
                        diff_hash=diff_hash,
                        diff_text=initial_state.diff,
                        api_key=initial_state.api_key,
                        github_token=github_token,
                        error_message=partial_msg,
                        user_id=user_id
                    )
                    logger.info('"[HISTORY] Analysis saved successfully: id=%s"', saved_id)
                    # Yield a final confirmation that data is saved
                    yield f"data: {json.dumps({'status': 'analysis_saved', 'id': saved_id})}\n\n"
                except Exception as e:
                    logger.error('"[HISTORY] FAILED to save analysis: %s"', str(e), exc_info=True)
            else:
                logger.warning('"[HISTORY] Skipping save - final_reviews is None after stream completion"')

        except Exception as e:
            # Handle and report errors during agent execution
            logger.error('"[STREAM] Agent pipeline exception: %s"', str(e), exc_info=True)
            if github_url and github_token:
                try:
                    await push_status_to_github(github_url, github_token, "error", f"Analysis failed: {str(e)}")
                except Exception:
                    pass
            error_payload = {"node": "error", "status": "failed", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

            # Persist the failed attempt to history so it shows in the Failed PR tab
            logger.info('"[HISTORY] Saving FAILED analysis to history: %s"', str(e)[:80])
            try:
                saved_id = await save_analysis(
                    github_url=github_url or "https://github.com/unknown/unknown",
                    model=initial_state.selected_model,
                    provider=initial_state.selected_provider,
                    diff_hash=diff_hash,
                    diff_text=initial_state.diff,
                    api_key=initial_state.api_key,
                    github_token=github_token,
                    error_message=str(e),
                    user_id=user_id
                )
                logger.info('"[HISTORY] Failed analysis saved: id=%s"', saved_id)
            except Exception as save_err:
                logger.error('"[HISTORY] Could not save failed analysis: %s"', str(save_err))



    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def batch_worker_task(repo_url: str, provider: str, model: str, scan_id: int, user_id: Optional[int] = None):
    """Background worker to silently process queued repositories."""
    diff = await fetch_github_diff_text(repo_url)
    if not diff:
        update_scan_status(scan_id, 'failed_no_diff')
        return

    # Simulate basic state for silent job
    initial_state = AgentState(
        diff=diff,
        github_url=repo_url,
        security_scan=True,
        perf_analysis=True,
        style_review=True,
        self_critique=True,
        selected_provider=provider,
        selected_model=model,
        status="started"
    )
    
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    
    try:
        final_reviews = None
        async for event in app_graph.astream(initial_state.model_dump(), config=config):
            if not event or "__interrupt__" in event:
                continue
            
            node_name = list(event.keys())[0]
            if event[node_name].get("reviews"):
                rev = event[node_name].get("reviews")
                final_reviews = ReviewReport(**rev) if isinstance(rev, dict) else rev
                
        if final_reviews:
            diff_hash = hashlib.sha256(f"{diff}_{provider}_{model}".encode()).hexdigest()
            await save_analysis(
                github_url=repo_url,
                model=model,
                provider=provider,
                review_report=final_reviews.model_dump(),
                diff_hash=diff_hash,
                diff_text=diff,
                api_key=None,  # Batch process may not have individual user keys immediately
                github_token=None,
                user_id=user_id
            )
            update_scan_status(scan_id, 'completed')
        else:
            update_scan_status(scan_id, 'failed')
            
    except Exception as e:
        print(f"Batch Worker Failed for {repo_url}: {e}")
        update_scan_status(scan_id, 'error')


@app.post("/batch_scan")
async def queue_batch_scan(request: Request, background_tasks: BackgroundTasks, current_user: Optional[Dict] = Depends(get_current_user)):
    """Queues a repository for asynchronous overnight scanning."""
    user_id = current_user.get("id") if current_user else None
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    repo_urls = data.get("repo_urls", [])
    provider = data.get("provider", "gemini")
    model = data.get("model", "gemini-1.5-flash")
    
    if not repo_urls:
        raise HTTPException(status_code=400, detail="repo_urls missing")
        
    queued_jobs = []
    for url in repo_urls:
        scan_id = queue_repo_for_scan(url, provider, model)
        background_tasks.add_task(batch_worker_task, url, provider, model, scan_id, user_id)
        queued_jobs.append(scan_id)
        
    return {"status": "queued", "queued_jobs": len(queued_jobs)}

@app.post("/feedback")
async def provide_feedback(request: Request, current_user: Optional[Dict] = Depends(get_current_user)):
    user_id = current_user.get("id") if current_user else None
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    thread_id = data.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")
    
    feedback = data.get("feedback")
    config = {"configurable": {"thread_id": thread_id}}

    await app_graph.aupdate_state(config, {"human_feedback": feedback})

    async def event_generator():
        try:
            final_reviews = None
            async for event in app_graph.astream(None, config=config):
                if not event:
                    continue
                
                if "__interrupt__" in event:
                    continue
                    
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                if state_update.get("reviews"):
                    rev = state_update.get("reviews")
                    final_reviews = ReviewReport(**rev) if isinstance(rev, dict) else rev
                
                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "tokens_saved": state_update.get("tokens_saved", 0),
                    "monologue": state_update.get("monologue", []),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05)
                
            # --- CONCLUDING TASKS FOR FEEDBACK LOOP ---
            if final_reviews:
                state = await app_graph.aget_state(config)
                state_values = state.values
                github_url = state_values.get("github_url")
                github_token = state_values.get("github_token")

                if github_url and github_token:
                    high_sev = [i for cat in ['security', 'performance', 'style'] 
                               for i in getattr(final_reviews, cat) if i.severity == 'high']
                    gh_state = "failure" if high_sev else "success"
                    desc = f"Found {len(high_sev)} high severity issues." if high_sev else "No high severity issues found."
                    if final_reviews.approval_status == "approved" and not high_sev:
                        gh_state = "success"
                    elif final_reviews.approval_status == "rejected":
                        gh_state = "failure"
                    
                    try:
                        await push_status_to_github(github_url, github_token, gh_state, desc)
                    except Exception as e:
                        print(f"DEBUG: Failed to push GitHub status: {e}")

                diff_text = state_values.get("diff", "")
                provider = state_values.get("selected_provider", "gemini")
                model = state_values.get("selected_model", "gemini-1.5-flash")
                api_key = state_values.get("api_key")
                diff_hash = hashlib.sha256(f"{diff_text}_{provider}_{model}".encode()).hexdigest()
                
                logger.info('"[HISTORY-FEEDBACK] Attempting to save analysis"')
                try:
                    partial_msg = "; ".join(final_reviews.partial_errors) if final_reviews.partial_errors else None
                    saved_id = await save_analysis(
                        github_url=github_url or "https://github.com/unknown/unknown",
                        model=model,
                        provider=provider,
                        review_report=final_reviews.model_dump(),
                        diff_hash=diff_hash,
                        diff_text=diff_text,
                        api_key=api_key,
                        github_token=github_token,
                        error_message=partial_msg,
                        user_id=user_id
                    )
                    logger.info('"[HISTORY-FEEDBACK] Analysis saved successfully: id=%s"', saved_id)
                    yield f"data: {json.dumps({'status': 'analysis_saved', 'id': saved_id})}\n\n"
                except Exception as e:
                    logger.error('"[HISTORY-FEEDBACK] FAILED to save analysis: %s"', str(e), exc_info=True)
                    
        except Exception as e:
            error_payload = {"node": "error", "status": "failed", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/push-to-github")
async def push_to_github(req: GithubCommentRequest):
    owner, repo, pull_number, commit_sha = parse_github_url(req.github_url)
    if not owner:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL. Must be a PR or Commit URL.")
    
    sha = commit_sha
    if pull_number:
        sha = await get_latest_commit_sha(owner, repo, pull_number, req.github_token)
    
    if not sha:
        raise HTTPException(status_code=400, detail="Failed to fetch commit SHA from GitHub")

    # Use GitHub "Suggested Change" format
    comment_body = f"**GitMind Suggestion:** {req.item.issue}\n\n```suggestion\n{req.item.fix}\n```"
    
    if pull_number:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/comments"
        payload = {
            "body": comment_body,
            "commit_id": sha,
            "path": req.item.file_path,
            "line": req.item.line_number,
            "side": "RIGHT"
        }
    else:
        # Commit comment (generic)
        url = f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}/comments"
        payload = {
            "body": comment_body,
            "path": req.item.file_path,
            "line": req.item.line_number
        }

    headers = {
        "Authorization": f"Bearer {req.github_token}",
        "Accept": "application/vnd.github.v3+json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code == 201:
            return {"status": "success", "comment_url": response.json().get("html_url")}
        else:
            error_detail = response.json()
            raise HTTPException(status_code=response.status_code, detail=f"GitHub API Error: {error_detail}")

@app.post("/apply-fix")
async def apply_fix(request: Request):
    """Pushes a generated code patch to the GitHub PR branch."""
    import base64
    import re
    data = await request.json()
    github_url = data.get("github_url")
    github_token = data.get("github_token")
    file_path = data.get("file_path")
    original_code = data.get("original_code", "")
    fixed_code = data.get("fixed_code")
    commit_msg = data.get("commit_message", f"Auto-Fix: {file_path}")
    
    if not all([github_url, github_token, file_path, fixed_code]):
        raise HTTPException(status_code=400, detail="Missing required parameters")
        
    owner, repo, pr_number, commit_sha = parse_github_url(github_url)
    
    if not owner or not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL provided.")
    
    if not pr_number:
        raise HTTPException(status_code=400, detail="Cannot apply fix: Please provide a Pull Request URL (not a Commit URL) so GitMind knows which branch to push to.")
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Get PR details to find branch name
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        pr_res = await client.get(pr_url, headers=headers)
        if pr_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch PR details")
            
        branch = pr_res.json().get("head", {}).get("ref")
        if not branch:
            raise HTTPException(status_code=400, detail="Could not find PR branch")
            
        # 2. Get file SHA on that branch
        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}?ref={branch}"
        file_res = await client.get(file_url, headers=headers)
        if file_res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"File {file_path} not found on branch {branch}")
            
        file_sha = file_res.json().get("sha")
        
        # 3. Update file with commit
        update_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
        
        old_content_b64 = file_res.json().get("content", "")
        if not old_content_b64:
            blob_url_fetch = file_res.json().get("git_url")
            if blob_url_fetch:
                blob_res_fetch = await client.get(blob_url_fetch, headers=headers)
                old_content_b64 = blob_res_fetch.json().get("content", "")
                
        old_content = base64.b64decode(old_content_b64).decode("utf-8") if old_content_b64 else ""
        
        if original_code and original_code in old_content:
            new_content = old_content.replace(original_code, fixed_code)
        elif original_code.strip() and original_code.strip() in old_content:
            new_content = old_content.replace(original_code.strip(), fixed_code.strip())
        else:
            new_content = old_content.replace(original_code, fixed_code) if original_code else fixed_code

        encoded_content = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": commit_msg,
            "content": encoded_content,
            "sha": file_sha,
            "branch": branch
        }
        
        update_res = await client.put(update_url, headers=headers, json=payload)
        if update_res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to push commit: {update_res.text}")
            
        return {"message": "Fix applied successfully", "commit_url": update_res.json().get("commit", {}).get("html_url")}

@app.post("/batch-apply-fixes")
async def batch_apply_fixes(request: Request):
    """Pushes an array of code patches to the GitHub PR branch as a single batch commit."""
    import base64
    import re
    data = await request.json()
    github_url = data.get("github_url")
    github_token = data.get("github_token")
    fixes = data.get("fixes", []) # List of { file_path, fixed_code, issue }
    
    if not all([github_url, github_token]) or not fixes:
        raise HTTPException(status_code=400, detail="Missing required parameters or empty fixes array")
        
    owner, repo, pr_number, commit_sha = parse_github_url(github_url)
    
    if not owner or not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL provided.")
    if not pr_number:
        raise HTTPException(status_code=400, detail="Cannot apply batch fix: Please provide a Pull Request URL.")
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch PR details for branch name
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        pr_res = await client.get(pr_url, headers=headers)
        if pr_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch PR details")
            
        branch = pr_res.json().get("head", {}).get("ref")
        if not branch:
            raise HTTPException(status_code=400, detail="Could not find PR branch")
            
        # 2. Get latest commit SHA for the branch exactly
        branch_url = f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{branch}"
        branch_res = await client.get(branch_url, headers=headers)
        if branch_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch branch details")
        latest_commit_sha = branch_res.json().get("object", {}).get("sha")
        
        # 3. Get the base tree SHA
        commit_url = f"https://api.github.com/repos/{owner}/{repo}/git/commits/{latest_commit_sha}"
        commit_res = await client.get(commit_url, headers=headers)
        base_tree_sha = commit_res.json().get("tree", {}).get("sha")
        
        # 4. Create a blob for each fixed file
        tree_elements = []
        for fix in fixes:
            file_url_batch = f"https://api.github.com/repos/{owner}/{repo}/contents/{fix['file_path']}?ref={branch}"
            file_res_batch = await client.get(file_url_batch, headers=headers)
            if file_res_batch.status_code != 200:
                raise HTTPException(status_code=400, detail=f"File {fix['file_path']} not found")
                
            old_content_b64 = file_res_batch.json().get("content", "")
            if not old_content_b64:
                blob_url_fetch = file_res_batch.json().get("git_url")
                if blob_url_fetch:
                    blob_res_fetch = await client.get(blob_url_fetch, headers=headers)
                    old_content_b64 = blob_res_fetch.json().get("content", "")
                    
            old_content = base64.b64decode(old_content_b64).decode("utf-8") if old_content_b64 else ""
            original_code = fix.get("original_code", "")
            fixed_code = fix.get("fixed_code", "")
            
            if original_code and original_code in old_content:
                new_content = old_content.replace(original_code, fixed_code)
            elif original_code.strip() and original_code.strip() in old_content:
                new_content = old_content.replace(original_code.strip(), fixed_code.strip())
            else:
                new_content = old_content.replace(original_code, fixed_code) if original_code else fixed_code

            blob_url = f"https://api.github.com/repos/{owner}/{repo}/git/blobs"
            encoded = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
            blob_payload = {"content": encoded, "encoding": "base64"}
            blob_res = await client.post(blob_url, headers=headers, json=blob_payload)
            if blob_res.status_code != 201:
                raise HTTPException(status_code=400, detail=f"Failed to create blob for {fix['file_path']}: {blob_res.text}")
            
            blob_sha = blob_res.json().get("sha")
            tree_elements.append({
                "path": fix["file_path"],
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha
            })
            
        # 5. Create a new Tree referencing the base tree + new blobs
        tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees"
        tree_payload = {"base_tree": base_tree_sha, "tree": tree_elements}
        tree_res = await client.post(tree_url, headers=headers, json=tree_payload)
        if tree_res.status_code != 201:
            raise HTTPException(status_code=400, detail="Failed to create git tree containing updates")
        new_tree_sha = tree_res.json().get("sha")
        
        # 6. Create the Commit dynamically summarizing the actions
        commit_msg = f"Auto-Fix: Resolved {len(fixes)} issue(s)\n\n"
        for fix in fixes:
             commit_msg += f"- {fix['file_path']}: {fix.get('issue', 'Applied automatic fix')}\n"
             
        commit_url_post = f"https://api.github.com/repos/{owner}/{repo}/git/commits"
        commit_payload = {
            "message": commit_msg,
            "tree": new_tree_sha,
            "parents": [latest_commit_sha]
        }
        create_commit_res = await client.post(commit_url_post, headers=headers, json=commit_payload)
        if create_commit_res.status_code != 201:
            raise HTTPException(status_code=400, detail="Failed to create git commit")
        new_commit_sha = create_commit_res.json().get("sha")
        html_url = create_commit_res.json().get("html_url")
        
        # 7. Update Branch Ref to point to new commit
        update_ref_payload = {"sha": new_commit_sha, "force": False}
        update_ref_res = await client.patch(branch_url, headers=headers, json=update_ref_payload)
        if update_ref_res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to update branch reference: {update_ref_res.text}")
            
        return {"message": f"Successfully batched {len(fixes)} fixes! 🚀", "commit_url": html_url}

@app.post("/suppress-issue")
async def suppress_issue(request: Request):
    """Adds a specific issue signature to the repo memory, so GitMind won't report it again."""
    data = await request.json()
    github_url = data.get("github_url")
    issue_signature = data.get("issue_signature")
    
    if not github_url or not issue_signature:
        raise HTTPException(status_code=400, detail="Missing github_url or issue_signature")
        
    owner, repo, _, _ = parse_github_url(github_url)
    if not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL")
        
    repo_full_name = f"{owner}/{repo}"
    success = await add_suppression(repo_full_name, issue_signature)
    
    if success:
        return {"message": "Issue dismissed successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to save suppression")

@app.get("/history")
async def get_analysis_history(
    repo: str = None,
    limit: int = 500,
    current_user: Optional[Dict] = Depends(get_current_user)
):
    """Returns past analysis history for the currently authenticated user only."""
    user_id = current_user.get("id") if current_user else None
    return await get_history(repo=repo, limit=limit, user_id=user_id)

@app.get("/history/{analysis_id}")
async def get_analysis_detail(analysis_id: int):
    """Returns a specific analysis including the full review data."""
    result = await get_analysis_by_id(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
