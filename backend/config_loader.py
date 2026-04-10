"""
GitMind Config Loader — .gitmind.yaml Support
Fetches and parses project-level configuration from the repository.
"""

import httpx
import yaml
import re
from pydantic import BaseModel, Field
from typing import List, Optional


class GitMindConfig(BaseModel):
    """Project-level configuration from .gitmind.yaml"""
    model: Optional[str] = None
    provider: Optional[str] = None
    severity_threshold: str = Field(default="low", description="Minimum severity to report: 'low', 'medium', or 'high'")
    focus: List[str] = Field(default_factory=lambda: ["security", "performance", "style"])
    ignore_paths: List[str] = Field(default_factory=list)
    custom_instructions: Optional[str] = None
    auto_push_comments: bool = False
    require_human_approval: bool = True


def parse_github_owner_repo(url: str) -> tuple:
    """Extract owner and repo from a GitHub URL."""
    pr_match = re.search(r"github\.com/([^/]+)/([^/]+)", url)
    if pr_match:
        return pr_match.group(1), pr_match.group(2)
    return None, None


async def fetch_gitmind_config(github_url: str, token: Optional[str] = None) -> Optional[GitMindConfig]:
    """
    Fetches .gitmind.yaml from the repo's default branch via GitHub API.
    Falls back to .gitmind.yml if .yaml doesn't exist.
    Returns None if no config file found (uses defaults).
    """
    owner, repo = parse_github_owner_repo(github_url)
    if not owner or not repo:
        return None

    headers = {
        "Accept": "application/vnd.github.v3.raw",
    }
    if token:
        headers["Authorization"] = f"token {token}"

    # Try both .yaml and .yml extensions
    filenames = [".gitmind.yaml", ".gitmind.yml"]
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        for filename in filenames:
            url = f"https://api.github.com/repos/{owner}/{repo}/contents/{filename}"
            try:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    raw_content = response.text
                    config_dict = yaml.safe_load(raw_content)
                    if isinstance(config_dict, dict):
                        return GitMindConfig(**config_dict)
            except Exception as e:
                print(f"DEBUG: Error fetching {filename}: {e}")
                continue
    
    return None


def should_ignore_file(file_path: str, ignore_patterns: List[str]) -> bool:
    """
    Check if a file path matches any of the ignore patterns.
    Supports simple glob-like patterns: *.test.ts, migrations/**, etc.
    """
    import fnmatch
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(file_path, pattern):
            return True
        # Handle **/ prefix for recursive matching
        if pattern.startswith("**/") and fnmatch.fnmatch(file_path, pattern[3:]):
            return True
        # Handle directory patterns like migrations/**
        if pattern.endswith("/**"):
            dir_prefix = pattern[:-3]
            if file_path.startswith(dir_prefix + "/") or file_path.startswith(dir_prefix):
                return True
    return False


def filter_review_by_config(review_data: dict, config: "GitMindConfig") -> dict:
    """
    Filters a ReviewReport dict based on the repo config:
    - Removes findings in ignored paths
    - Removes findings below severity threshold
    """
    severity_order = {"low": 0, "medium": 1, "high": 2}
    threshold = severity_order.get(config.severity_threshold, 0)
    
    for category in ["security", "performance", "style"]:
        items = review_data.get(category, [])
        filtered = []
        for item in items:
            # Check severity threshold
            item_severity = severity_order.get(item.get("severity", "low"), 0)
            if item_severity < threshold:
                continue
            
            # Check ignore paths
            file_path = item.get("file_path", "")
            if file_path and should_ignore_file(file_path, config.ignore_paths):
                continue
            
            filtered.append(item)
        review_data[category] = filtered
    
    return review_data
