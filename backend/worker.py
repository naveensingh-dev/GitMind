"""
GitMind Worker — ARQ Async Job Queue
Phase B.1: Decouples LLM pipeline execution from HTTP request lifecycle.

Architecture:
  POST /analyze → enqueues job → returns { job_id }
  Worker picks up job → runs LangGraph → publishes SSE events to Redis pub/sub
  GET /jobs/{job_id}/stream → client subscribes to Redis channel

Running the worker:
  python worker.py

In production:
  arq worker.WorkerSettings
"""

import asyncio
import json
import os
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("gitmind.worker")
logging.basicConfig(level=logging.INFO)

# ── Redis configuration ────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ── In-memory job store (replaced by Redis in production) ─────────────────────
# { job_id: { status, result, events: [], created_at, error } }
_job_store: dict = {}


def create_job(payload: dict) -> str:
    """Create a new analysis job and return its ID."""
    job_id = str(uuid.uuid4())
    _job_store[job_id] = {
        "id": job_id,
        "status": "queued",
        "payload": payload,
        "events": [],
        "result": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info("Job created: %s", job_id)
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    """Retrieve a job by ID."""
    return _job_store.get(job_id)


def update_job_status(job_id: str, status: str, error: str = None):
    """Update job status."""
    if job_id in _job_store:
        _job_store[job_id]["status"] = status
        _job_store[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
        if error:
            _job_store[job_id]["error"] = error


def append_job_event(job_id: str, event: dict):
    """Append a SSE event to the job's event log."""
    if job_id in _job_store:
        _job_store[job_id]["events"].append(event)
        _job_store[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()


async def run_analysis_job(job_id: str, payload: dict):
    """
    Core job function: runs the full LangGraph pipeline for a given payload.
    This is executed by the worker process, NOT inside an HTTP request.
    
    Events are appended to the job store and can be streamed via SSE.
    In production (with Redis), events are published to a Redis pub/sub channel.
    """
    from agent import app_graph, fetch_github_diff_text
    from schemas import AgentState, ReviewReport
    from history import save_analysis, get_cached_analysis
    import re

    update_job_status(job_id, "running")
    logger.info("Worker: Starting job %s", job_id)

    github_url = payload.get("github_url")
    github_token = payload.get("github_token")
    thread_id = payload.get("thread_id", str(uuid.uuid4()))
    config = {"configurable": {"thread_id": thread_id}}

    def emit(event: dict):
        """Append event to job store (and publish to Redis in production)."""
        append_job_event(job_id, event)

    try:
        initial_state = AgentState(
            diff=payload.get("diff", ""),
            github_url=github_url,
            security_scan=payload.get("security_scan", True),
            perf_analysis=payload.get("perf_analysis", True),
            style_review=payload.get("style_review", True),
            self_critique=payload.get("self_critique", True),
            selected_provider=payload.get("selected_provider", "gemini"),
            selected_model=payload.get("selected_model", "gemini-1.5-flash"),
            api_key=payload.get("api_key"),
            status="started"
        )
    except Exception as e:
        update_job_status(job_id, "failed", f"Invalid payload: {str(e)}")
        return

    diff_hash = hashlib.sha256(
        f"{initial_state.diff}_{initial_state.selected_provider}_{initial_state.selected_model}".encode()
    ).hexdigest()

    # Cache check
    cached = await get_cached_analysis(diff_hash, initial_state.selected_model, initial_state.selected_provider)
    if cached and cached.get("review_data"):
        emit({"node": "arbitrate", "status": "arbitrate_complete",
              "reviews": cached["review_data"],
              "monologue": ["⚡ Cache Hit! Returning instantly."]})
        update_job_status(job_id, "completed")
        _job_store[job_id]["result"] = cached["review_data"]
        return

    final_reviews = None
    try:
        async for event in app_graph.astream(initial_state.model_dump(), config=config):
            if not event or "__interrupt__" in event:
                continue
            node_name = list(event.keys())[0]
            state_update = event[node_name]
            if state_update.get("reviews"):
                rev = state_update.get("reviews")
                final_reviews = ReviewReport(**rev) if isinstance(rev, dict) else rev

            sse_event = {
                "node": node_name,
                "status": state_update.get("status"),
                "refinement_count": state_update.get("refinement_count", 0),
                "tokens_saved": state_update.get("tokens_saved", 0),
                "monologue": state_update.get("monologue", []),
                "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None,
            }
            emit(sse_event)

        if final_reviews:
            _job_store[job_id]["result"] = final_reviews.model_dump()
            # Persist to history
            try:
                if github_url:
                    await save_analysis(
                        github_url=github_url,
                        model=initial_state.selected_model,
                        provider=initial_state.selected_provider,
                        review_report=final_reviews.model_dump(),
                        diff_hash=diff_hash,
                        diff_text=initial_state.diff,
                        api_key=initial_state.api_key,
                        github_token=github_token,
                    )
            except Exception as save_err:
                logger.warning("Failed to save job result to history: %s", save_err)

        update_job_status(job_id, "completed")
        logger.info("Worker: Job %s completed successfully", job_id)

    except Exception as e:
        error_msg = str(e)
        logger.error("Worker: Job %s failed: %s", job_id, error_msg)
        emit({"node": "error", "status": "failed", "message": error_msg})
        update_job_status(job_id, "failed", error_msg)

        # Persist failed attempt
        if github_url:
            try:
                from history import save_analysis
                await save_analysis(
                    github_url=github_url,
                    model=initial_state.selected_model,
                    provider=initial_state.selected_provider,
                    api_key=initial_state.api_key,
                    github_token=github_token,
                    error_message=error_msg,
                )
            except Exception:
                pass


# ── ARQ Worker Settings (for production: `arq worker.WorkerSettings`) ─────────
try:
    from arq import ArqRedis
    from arq.connections import RedisSettings

    async def analyze_pr_job(ctx, job_id: str, payload: dict):
        """ARQ job function — runs in the worker process."""
        await run_analysis_job(job_id, payload)

    class WorkerSettings:
        functions = [analyze_pr_job]
        redis_settings = RedisSettings.from_dsn(REDIS_URL)
        max_jobs = 10
        job_timeout = 600  # 10 minutes max per analysis
        keep_result = 3600  # Keep results for 1 hour

    HAS_ARQ = True
except ImportError:
    HAS_ARQ = False
    logger.info("ARQ not installed — using in-process job execution (dev mode)")


if __name__ == "__main__":
    import arq
    arq.run_worker(WorkerSettings)
