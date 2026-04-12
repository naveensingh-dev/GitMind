"""
GitMind Analysis History — PostgreSQL-backed storage (SQLAlchemy Async)
Phase B.2: Migration from SQLite to production-grade PostgreSQL.
Persists analysis results and enables repo-aware intelligence.
"""

import json
import os
import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy import select, update, insert, func, delete
from database import Analysis, AsyncSessionLocal, User

logger = logging.getLogger("gitmind.history")

def safe_json_fallback(obj):
    """Fallback serialization for non-primitive types inside ReviewReport."""
    try:
        return str(obj)
    except Exception:
        return None

# ── SUPPRESSIONS (Repo Memory) ────────────────────────────────────────────────

async def add_suppression(repo: str, issue_signature: str) -> bool:
    """
    Adds a suppressed issue to the repo's long-term memory.
    Note: In Phase B.2, we're focusing on Analysis history. 
    Repo specific memory/suppressions will be moved to a 'suppressions' table in Phase B.3.
    For now, we store them as metadata or in a simple join table if needed.
    """
    # Placeholder: Phase B.3 will implement the full Suppressions table.
    return True

async def get_suppressed_issues(repo: str) -> List[str]:
    """Returns a list of issue signatures that were dismissed for a repo."""
    # Placeholder: Phase B.3 will implement the full Suppressions table.
    return []


# ── ANALYSIS HISTORY ─────────────────────────────────────────────────────────

async def save_analysis(
    github_url: str,
    model: str,
    provider: str,
    review_report: Optional[Dict[str, Any]] = None,
    diff_hash: Optional[str] = None,
    diff_text: Optional[str] = None,
    api_key: Optional[str] = None,
    github_token: Optional[str] = None,
    error_message: Optional[str] = None,
    user_id: Optional[int] = None
) -> int:
    """
    Saves a completed or failed analysis to the history database.
    Async implementation using SQLAlchemy 2.0.
    """
    repo_match = re.search(r"github\.com/([^/]+/[^/]+)", github_url)
    repo = repo_match.group(1) if repo_match else "unknown"
    logger.info('"[save_analysis] repo=%s model=%s provider=%s has_review=%s has_error=%s"', repo, model, provider, review_report is not None, error_message is not None)

    # For failed runs there may be no review_report
    review_report = review_report or {}
    security = review_report.get("security", [])
    performance = review_report.get("performance", [])
    style = review_report.get("style", [])
    all_items = security + performance + style
    high_count = sum(1 for item in all_items if item.get("severity") == "high")

    approval_status = review_report.get("approval_status") if review_report else ("failed" if error_message else "unknown")

    async with AsyncSessionLocal() as session:
        new_analysis = Analysis(
            github_url=github_url,
            repo=repo,
            model=model,
            provider=provider,
            status=approval_status,
            confidence_score=review_report.get("confidence_score", 0),
            security_count=len(security),
            performance_count=len(performance),
            style_count=len(style),
            high_severity_count=high_count,
            review_json=json.dumps(review_report, default=safe_json_fallback) if review_report else None,
            diff_hash=diff_hash,
            error_message=error_message,
            user_id=user_id,
            created_at=datetime.now(timezone.utc)
        )
        session.add(new_analysis)
        await session.commit()
        await session.refresh(new_analysis)
        logger.info('"[save_analysis] Committed to DB: id=%s status=%s"', new_analysis.id, approval_status)
        return new_analysis.id


async def get_history(repo: Optional[str] = None, limit: int = 500, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Returns list of past analyses, optionally filtered by repo and/or user_id.
    When user_id is provided, only that user's analyses are returned.
    """
    logger.debug('"[get_history] Fetching history: repo=%s limit=%s user_id=%s"', repo or 'all', limit, user_id or 'all')
    async with AsyncSessionLocal() as session:
        query = select(Analysis).order_by(Analysis.created_at.desc()).limit(limit)
        if repo:
            query = query.where(Analysis.repo.ilike(f"%{repo}%"))
        if user_id is not None:
            query = query.where(Analysis.user_id == user_id)
        
        result = await session.execute(query)
        analyses = result.scalars().all()
        
        return [
            {
                "id": a.id,
                "github_url": a.github_url,
                "repo": a.repo,
                "model": a.model,
                "provider": a.provider,
                "approval_status": a.status,
                "confidence_score": a.confidence_score,
                "security_count": a.security_count,
                "performance_count": a.performance_count,
                "style_count": a.style_count,
                "high_severity_count": a.high_severity_count,
                "error_message": a.error_message,
                "created_at": a.created_at.replace(tzinfo=timezone.utc).isoformat() if a.created_at else "",
            }
            for a in analyses
        ]


async def get_analysis_by_id(analysis_id: int) -> Optional[Dict[str, Any]]:
    """Returns a specific analysis including the full review JSON."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
        a = result.scalar_one_or_none()
        
        if a:
            return {
                "id": a.id,
                "github_url": a.github_url,
                "repo": a.repo,
                "model": a.model,
                "provider": a.provider,
                "approval_status": a.status,
                "confidence_score": a.confidence_score,
                "security_count": a.security_count,
                "performance_count": a.performance_count,
                "style_count": a.style_count,
                "high_severity_count": a.high_severity_count,
                "review_json": a.review_json,
                "review_data": json.loads(a.review_json) if a.review_json else None,
                "error_message": a.error_message,
                "created_at": a.created_at.isoformat(),
            }
        return None


async def get_cached_analysis(diff_hash: str, model: str, provider: str) -> Optional[Dict[str, Any]]:
    """Returns a cached analysis based on the precise diff hash + model combination."""
    if not diff_hash:
        return None
        
    async with AsyncSessionLocal() as session:
        query = select(Analysis).where(
            Analysis.diff_hash == diff_hash,
            Analysis.model == model,
            Analysis.provider == provider
        ).order_by(Analysis.created_at.desc()).limit(1)
        
        result = await session.execute(query)
        a = result.scalar_one_or_none()
        
        if a:
            return {
                "id": a.id,
                "review_data": json.loads(a.review_json) if a.review_json else None,
            }
        return None


# ── BATCH SCAN QUEUE ──────────────────────────────────────────────────────────

async def queue_repo_for_scan(repo_url: str, provider: str, model: str) -> int:
    """Placeholder for Phase B.4 - will use a dedicated repository_scans table."""
    return 0

async def update_scan_status(scan_id: int, status: str):
    """Placeholder for Phase B.4."""
    pass
