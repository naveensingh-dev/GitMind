from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class ReviewItem(BaseModel):
    issue: str = Field(description="Brief description of the issue found")
    severity: Literal["high", "medium", "low"] = Field(description="The impact of the issue")
    file_path: Optional[str] = Field(description="The relative path of the file containing the issue")
    line_number: Optional[int] = Field(description="The line number in the diff (new file line number) where the issue exists")
    line: Optional[str] = Field(description="The relevant line of code from the diff")
    fix: str = Field(description="Actionable suggestion to fix the issue")

class ReviewReport(BaseModel):
    security: List[ReviewItem] = Field(default_factory=list)
    performance: List[ReviewItem] = Field(default_factory=list)
    style: List[ReviewItem] = Field(default_factory=list)
    summary: str = Field(description="2-3 sentence executive summary of the review")
    approval_status: Literal["approved", "needs_changes", "rejected"] = Field(description="Final verdict")
    confidence_score: int = Field(ge=0, le=100, description="Confidence in the review quality")

class CritiqueResult(BaseModel):
    accurate: bool = Field(description="Is the feedback factually correct based on the diff?")
    constructive: bool = Field(description="Is the tone professional and helpful?")
    score: int = Field(ge=0, le=100, description="Overall quality score of the review")
    feedback: Optional[str] = Field(description="Specific instructions for the refinement loop")

class AgentState(BaseModel):
    diff: Optional[str] = ""
    github_url: Optional[str] = None
    security_scan: bool = True
    perf_analysis: bool = True
    style_review: bool = True
    self_critique: bool = True
    
    # User selection
    selected_provider: str = "gemini"
    selected_model: str = "gemini-2.0-flash"
    api_key: Optional[str] = None
    
    # Internal state
    reviews: Optional[ReviewReport] = None
    critique: Optional[CritiqueResult] = None
    human_feedback: Optional[str] = None
    monologue: List[str] = Field(default_factory=list)
    refinement_count: int = 0
    final_markdown: str = ""
    status: str = "idle"
