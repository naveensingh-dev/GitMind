"""
GitMind Auto-Fix Agent — Patch Generation
Generates concrete code patches for review findings.
Low-risk fixes can be auto-applied; high-severity issues only show suggestions.
"""

from pydantic import BaseModel, Field
from typing import List, Optional


# --- SCHEMAS ---

class AutoFixItem(BaseModel):
    """A single auto-generated code fix."""
    file_path: Optional[str] = Field(default="", description="Path to the file being fixed")
    original_code: str = Field(description="The original code snippet that has the issue")
    fixed_code: str = Field(description="The corrected code snippet")
    description: Optional[str] = Field(default="", description="Brief explanation of what the fix does")
    related_issue: Optional[str] = Field(default="", description="The review finding this fix addresses")
    severity: str = Field(default="low", description="Severity of the original issue: low, medium, high")
    is_safe: bool = Field(default=True, description="True if this fix is safe to auto-apply (false for high-severity security issues)")


class AutoFixReport(BaseModel):
    """Collection of auto-generated code fixes."""
    fixes: List[AutoFixItem] = Field(default_factory=list)
    summary: str = Field(default="", description="Brief summary of all fixes generated")
    total_fixes: int = Field(default=0)
    safe_fixes: int = Field(default=0, description="Number of fixes safe for auto-apply")


# --- PROMPT ---

AUTO_FIX_PROMPT = """You are an expert code fixer. You receive a code diff and a list of review findings.
For each finding, generate a CONCRETE code fix.

RULES:
1. For each finding, output the ORIGINAL code snippet and the FIXED code snippet.
2. The fix must be minimal — change only what's necessary to resolve the issue.
3. Preserve the original coding style (indentation, naming conventions, etc.)
4. Set is_safe=true ONLY for low-risk fixes:
   - Missing null checks
   - Unused imports
   - Magic numbers → named constants
   - Missing error handling
   - Style/formatting issues
5. Set is_safe=false for ANY security-related fix:
   - SQL injection remediation
   - Hardcoded secrets removal
   - Authentication/authorization changes
   - Input validation changes
6. If a finding is too vague to generate a concrete fix, skip it.
7. Include the file_path for each fix.

Respond in the exact JSON schema provided. Be precise and minimal."""
