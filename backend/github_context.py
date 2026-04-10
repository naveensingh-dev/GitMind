"""
GitMind GitHub Context — PR Comment Fetcher
Fetches existing review discussion from a PR so the agent
doesn't contradict or duplicate what humans already discussed.
"""

import re
import httpx
from typing import List, Optional


async def fetch_pr_comments(github_url: str, token: Optional[str] = None) -> Optional[str]:
    """
    Fetches review comments and issue comments from a GitHub PR.
    Returns a formatted context string summarizing the existing discussion.
    Returns None for commit URLs (no PR discussion to fetch).
    """
    # Only works for PR URLs, not commit URLs
    pr_match = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", github_url)
    if not pr_match:
        return None
    
    owner, repo, pr_number = pr_match.groups()
    
    headers = {
        "Accept": "application/vnd.github.v3+json",
    }
    if token:
        headers["Authorization"] = f"token {token}"
    
    comments = []
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Fetch review comments (inline code comments)
        try:
            url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/comments"
            response = await client.get(url, headers=headers, params={"per_page": 20, "sort": "created", "direction": "desc"})
            if response.status_code == 200:
                for c in response.json():
                    user = c.get("user", {}).get("login", "unknown")
                    body = c.get("body", "")[:200]  # Truncate long comments
                    path = c.get("path", "")
                    line = c.get("line") or c.get("original_line") or "?"
                    if body.strip():
                        comments.append(f"@{user} on {path}:{line} — \"{body}\"")
        except Exception as e:
            print(f"DEBUG: Error fetching PR review comments: {e}")
        
        # Fetch issue comments (general PR discussion)
        try:
            url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pr_number}/comments"
            response = await client.get(url, headers=headers, params={"per_page": 10, "sort": "created", "direction": "desc"})
            if response.status_code == 200:
                for c in response.json():
                    user = c.get("user", {}).get("login", "unknown")
                    body = c.get("body", "")[:200]
                    if body.strip():
                        comments.append(f"@{user} (general): \"{body}\"")
        except Exception as e:
            print(f"DEBUG: Error fetching PR issue comments: {e}")
    
    if not comments:
        return None
    
    # Format into a concise context string
    context_lines = [
        "=== EXISTING PR DISCUSSION (DO NOT CONTRADICT) ===",
        f"Found {len(comments)} existing comment(s) on this PR:",
        "",
    ]
    for comment in comments[:15]:  # Cap at 15 to avoid token waste
        context_lines.append(f"• {comment}")
    
    context_lines.append("")
    context_lines.append(
        "IMPORTANT: If an issue was already discussed and resolved in the comments above, "
        "do NOT re-raise it. If a reviewer approved a specific pattern, do NOT flag it as a problem."
    )
    
    return "\n".join(context_lines)
