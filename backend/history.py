"""
GitMind Analysis History — SQLite-backed storage
Persists analysis results so users can see past reviews
and enable future diff-of-diff comparisons.
"""

import json
import sqlite3
import os
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import hashlib


DB_PATH = os.path.join(os.path.dirname(__file__), "gitmind_history.db")


def _get_connection() -> sqlite3.Connection:
    """Get a SQLite connection and ensure the table exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            github_url TEXT NOT NULL,
            repo TEXT NOT NULL,
            model TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'gemini',
            approval_status TEXT,
            confidence_score INTEGER,
            security_count INTEGER DEFAULT 0,
            performance_count INTEGER DEFAULT 0,
            style_count INTEGER DEFAULT 0,
            high_severity_count INTEGER DEFAULT 0,
            review_json TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repo_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo TEXT NOT NULL,
            issue_signature TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(repo, issue_signature)
        )
    """)
    
    # Run migration to add diff_hash if it doesn't exist
    try:
        conn.execute("ALTER TABLE analysis_history ADD COLUMN diff_hash TEXT")
    except sqlite3.OperationalError:
        pass
        
    # Run migration to add diff_text if it doesn't exist
    try:
        conn.execute("ALTER TABLE analysis_history ADD COLUMN diff_text TEXT")
    except sqlite3.OperationalError:
        pass
        
    # Run migration to add api_key and github_token
    try:
        conn.execute("ALTER TABLE analysis_history ADD COLUMN api_key TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE analysis_history ADD COLUMN github_token TEXT")
    except sqlite3.OperationalError:
        pass

    # Migration: add error_message column for failed analyses
    try:
        conn.execute("ALTER TABLE analysis_history ADD COLUMN error_message TEXT")
    except sqlite3.OperationalError:
        pass
        
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repo_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    conn.commit()
    return conn

def add_suppression(repo: str, issue_signature: str) -> bool:
    """Adds a suppressed issue to the repo's long-term memory."""
    conn = _get_connection()
    try:
        conn.execute("""
            INSERT OR REPLACE INTO repo_memory (repo, issue_signature, status, created_at)
            VALUES (?, ?, ?, ?)
        """, (repo, issue_signature, "dismissed", datetime.now(timezone.utc).isoformat()))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving suppression: {e}")
        return False
    finally:
        conn.close()

def get_suppressed_issues(repo: str) -> List[str]:
    """Returns a list of issue signatures that were dismissed for a repo."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT issue_signature FROM repo_memory WHERE repo = ? AND status = 'dismissed'",
            (repo,)
        ).fetchall()
        return [row["issue_signature"] for row in rows]
    finally:
        conn.close()



def save_analysis(
    github_url: str,
    model: str,
    provider: str,
    review_report: Optional[Dict[str, Any]] = None,
    diff_hash: Optional[str] = None,
    diff_text: Optional[str] = None,
    api_key: Optional[str] = None,
    github_token: Optional[str] = None,
    error_message: Optional[str] = None,
) -> int:
    """
    Saves a completed or failed analysis to the history database.
    Pass error_message for failed runs; review_report for successful ones.
    Returns the inserted row ID.
    """
    import re
    repo_match = re.search(r"github\.com/([^/]+/[^/]+)", github_url)
    repo = repo_match.group(1) if repo_match else "unknown"

    # For failed runs there may be no review_report
    review_report = review_report or {}
    security = review_report.get("security", [])
    performance = review_report.get("performance", [])
    style = review_report.get("style", [])
    all_items = security + performance + style
    high_count = sum(1 for item in all_items if item.get("severity") == "high")

    approval_status = "failed" if error_message else review_report.get("approval_status", "unknown")

    conn = _get_connection()
    try:
        cursor = conn.execute("""
            INSERT INTO analysis_history 
            (github_url, repo, model, provider, approval_status, confidence_score,
             security_count, performance_count, style_count, high_severity_count,
             review_json, diff_hash, diff_text, api_key, github_token, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            github_url,
            repo,
            model,
            provider,
            approval_status,
            review_report.get("confidence_score", 0),
            len(security),
            len(performance),
            len(style),
            high_count,
            json.dumps(review_report) if review_report else None,
            diff_hash,
            diff_text,
            api_key,
            github_token,
            error_message,
            datetime.now(timezone.utc).isoformat(),
        ))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_history(repo: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Returns list of past analyses, optionally filtered by repo.
    Results are ordered by most recent first.
    """
    conn = _get_connection()
    try:
        if repo:
            rows = conn.execute(
                "SELECT id, github_url, repo, model, provider, approval_status, "
                "confidence_score, security_count, performance_count, style_count, "
                "high_severity_count, api_key, github_token, error_message, created_at "
                "FROM analysis_history WHERE repo LIKE ? ORDER BY created_at DESC LIMIT ?",
                (f"%{repo}%", limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, github_url, repo, model, provider, approval_status, "
                "confidence_score, security_count, performance_count, style_count, "
                "high_severity_count, api_key, github_token, error_message, created_at "
                "FROM analysis_history ORDER BY created_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
        
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_analysis_by_id(analysis_id: int) -> Optional[Dict[str, Any]]:
    """Returns a specific analysis including the full review JSON."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM analysis_history WHERE id = ?",
            (analysis_id,)
        ).fetchone()
        
        if row:
            result = dict(row)
            if result.get("review_json"):
                result["review_data"] = json.loads(result["review_json"])
            return result
        return None
    finally:
        conn.close()

def get_cached_analysis(diff_hash: str, model: str, provider: str) -> Optional[Dict[str, Any]]:
    """Returns a cached analysis based on the precise diff hash + model combination."""
    if not diff_hash:
        return None
        
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM analysis_history WHERE diff_hash = ? AND model = ? AND provider = ? ORDER BY created_at DESC LIMIT 1",
            (diff_hash, model, provider)
        ).fetchone()
        
        if row:
            result = dict(row)
            if result.get("review_json"):
                result["review_data"] = json.loads(result["review_json"])
            return result
        return None
    finally:
        conn.close()

def queue_repo_for_scan(repo_url: str, provider: str, model: str) -> int:
    """Queues a repository for asynchronous batch scanning."""
    conn = _get_connection()
    try:
        cursor = conn.execute("""
            INSERT INTO repo_queue (repo_url, provider, model, created_at)
            VALUES (?, ?, ?, ?)
        """, (repo_url, provider, model, datetime.now(timezone.utc).isoformat()))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def get_pending_scans() -> List[Dict[str, Any]]:
    """Retrieves all pending batch scan jobs."""
    conn = _get_connection()
    try:
        rows = conn.execute("SELECT * FROM repo_queue WHERE status = 'pending' ORDER BY created_at ASC").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def update_scan_status(scan_id: int, status: str):
    """Updates the status of a batch scan (e.g. 'completed' or 'failed')."""
    conn = _get_connection()
    try:
        conn.execute("UPDATE repo_queue SET status = ? WHERE id = ?", (status, scan_id))
        conn.commit()
    finally:
        conn.close()
