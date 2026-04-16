"""
GitMind Architecture Review — Dependency Visualization
Generates Mermaid diagrams showing module dependencies and
flags architectural anti-patterns in the changed code.
"""

from pydantic import BaseModel, Field
from typing import List, Optional


# --- SCHEMAS ---

class ArchObservation(BaseModel):
    """A single architectural observation."""
    type: Optional[str] = Field(default="info", description="Type: circular_dependency, god_object, tight_coupling, layer_violation, good_pattern")
    description: Optional[str] = Field(default="", description="Detailed explanation of the observation")
    severity: str = Field(default="info", description="info, warning, or critical")
    files_involved: List[str] = Field(default_factory=list, description="Files involved in this observation")


class ArchReview(BaseModel):
    """Architecture review with dependency diagram."""
    mermaid_code: str = Field(default="", description="Valid Mermaid diagram code showing module dependencies")
    observations: List[ArchObservation] = Field(default_factory=list)
    summary: str = Field(default="", description="Brief architecture summary")


# --- PROMPT ---

ARCH_REVIEW_PROMPT = """You are a senior software architect. You receive a code diff showing changes to a codebase.
Your job is to analyze the architectural implications and generate a dependency diagram.

TASKS:
1. Generate a **Mermaid flowchart** showing how the CHANGED files relate to each other:
   - Use `graph TD` (top-down) format.
   - Show imports, function calls, and data flow between files.
   - Use meaningful labels (not just file names).
   - **CRITICAL**: If a node label contains dots (e.g., `app.component.ts`), it MUST be wrapped in double quotes: `A["app.component.ts"]`.
   - Color-code nodes: green for new files, orange for modified, gray for unchanged dependencies.
   - Example format:
     ```
     graph TD
       A["auth.service.ts"] -->|imports| B["db.ts"]
       B -->|queries| C[("Database")]
       A -->|validates| D["middleware.ts"]
     ```

2. Identify architectural observations:
   - **circular_dependency**: A imports B which imports A
   - **god_object**: A file/class with too many responsibilities
   - **tight_coupling**: Components that are overly dependent on each other
   - **layer_violation**: UI code directly accessing database, etc.
   - **good_pattern**: Well-structured separation of concerns, proper abstraction

3. Provide a concise architecture summary.

RULES:
- **CRITICAL**: Use spaces around arrows for clarity: `A --> B` instead of `A-->B`.
- The Mermaid code must be VALID and renderable by Mermaid.js.
- **Do NOT wrap the mermaid code in markdown code fences — just output the raw diagram text.**
- Focus only on top 10-12 most critical files touched in the diff. Group them into subgraphs by directory if there are many files.
- Include at most 12 nodes in the diagram to maintain readability.
- Start node IDs with letters (not numbers).

Respond in the exact JSON schema provided."""
