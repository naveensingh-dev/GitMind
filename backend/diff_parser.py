"""
GitMind Diff Parser — Smart Diff Chunking
Parses unified diffs into structured per-file chunks, prioritizes them,
and assembles a token-efficient context string for the LLM.
"""

import re
from typing import List, Optional
from dataclasses import dataclass, field
import warnings

# Attempt to load LLMLingua for Prompt Compression
try:
    from llmlingua import PromptCompressor
    # Initialize the tiny compressor model natively (loads ~500MB model into RAM)
    compressor = PromptCompressor(
        model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
        use_llmlingua2=True,
        device_map="cpu"  # Force CPU to avoid CUDA requirements locally
    )
    LLMLINGUA_AVAILABLE = True
except ImportError:
    compressor = None
    LLMLINGUA_AVAILABLE = False
    warnings.warn("LLMLingua not installed. Run 'pip install llmlingua torch transformers' for ~50% token cost reduction.")


@dataclass
class DiffChunk:
    """Represents a single file's diff with metadata."""
    file_path: str
    language: str = ""
    additions: int = 0
    deletions: int = 0
    raw_diff: str = ""
    priority: int = 0  # Lower = higher priority


# Extension → language mapping for context headers
LANG_MAP = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript/React",
    ".jsx": "JavaScript/React", ".java": "Java", ".go": "Go", ".rs": "Rust",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".cpp": "C++", ".c": "C",
    ".swift": "Swift", ".kt": "Kotlin", ".scala": "Scala", ".sh": "Shell",
    ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
    ".yaml": "YAML", ".yml": "YAML", ".json": "JSON", ".toml": "TOML",
    ".md": "Markdown", ".txt": "Text",
}

# File patterns sorted by priority (lower number = reviewed first)
PRIORITY_PATTERNS = [
    (r"\.(py|js|ts|tsx|jsx|java|go|rs|rb|php|cs|cpp|c|swift|kt|scala)$", 1),  # Source code
    (r"\.(sql)$", 2),                                                          # Database
    (r"\.(sh|bash|zsh)$", 3),                                                  # Scripts
    (r"\.(html|css|scss)$", 4),                                                # Templates/Styles
    (r"(\.test\.|\.spec\.|_test\.|test_)", 5),                                 # Tests
    (r"\.(yaml|yml|toml|json|ini|cfg|conf)$", 6),                              # Config
    (r"\.(md|txt|rst|doc)$", 7),                                               # Docs
    (r"(lock|\.lock|package-lock)", 8),                                         # Lock files
]


def detect_language(file_path: str) -> str:
    """Detect language from file extension."""
    for ext, lang in LANG_MAP.items():
        if file_path.endswith(ext):
            return lang
    return "Unknown"


def assign_priority(file_path: str) -> int:
    """Assign a review priority based on file type. Lower = higher priority."""
    for pattern, priority in PRIORITY_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return priority
    return 5  # Default middle priority


def parse_unified_diff(raw_diff: str) -> List[DiffChunk]:
    """
    Parses a unified diff string into structured per-file DiffChunk objects.
    Handles both 'diff --git' and '--- a/' style headers.
    """
    chunks: List[DiffChunk] = []
    
    # Split on file boundaries
    file_diffs = re.split(r"(?=^diff --git )", raw_diff, flags=re.MULTILINE)
    
    for file_diff in file_diffs:
        file_diff = file_diff.strip()
        if not file_diff:
            continue
        
        # Extract file path from diff header
        path_match = re.search(r"diff --git a/(.+?) b/(.+)", file_diff)
        if not path_match:
            # Try alternate format (just --- / +++ headers)
            path_match = re.search(r"^\+\+\+ b?/(.+)$", file_diff, re.MULTILINE)
            if path_match:
                file_path = path_match.group(1)
            else:
                continue
        else:
            file_path = path_match.group(2)
        
        # Count additions and deletions
        additions = len(re.findall(r"^\+[^+]", file_diff, re.MULTILINE))
        deletions = len(re.findall(r"^-[^-]", file_diff, re.MULTILINE))
        
        chunk = DiffChunk(
            file_path=file_path,
            language=detect_language(file_path),
            additions=additions,
            deletions=deletions,
            raw_diff=file_diff,
            priority=assign_priority(file_path),
        )
        chunks.append(chunk)
    
    return chunks


def prioritize_chunks(chunks: List[DiffChunk]) -> List[DiffChunk]:
    """Sorts chunks by priority (source code first, lock files last)."""
    return sorted(chunks, key=lambda c: (c.priority, -c.additions - c.deletions))


def build_review_context(raw_diff: str, max_chars: int = 120000) -> str:
    """
    Assembles a structured, prioritized context string from a raw diff.
    Each file chunk gets a header with metadata for better LLM comprehension.
    
    Args:
        raw_diff: The raw unified diff string
        max_chars: Maximum character budget for the assembled context
    
    Returns:
        A structured string ready for LLM consumption
    """
    chunks = parse_unified_diff(raw_diff)
    
    if not chunks:
        # Not a multi-file diff — return as-is
        return raw_diff
    
    chunks = prioritize_chunks(chunks)
    
    total_files = len(chunks)
    total_additions = sum(c.additions for c in chunks)
    total_deletions = sum(c.deletions for c in chunks)
    
    # Build the context with a summary header
    parts = [
        f"=== PR DIFF SUMMARY ===",
        f"Files changed: {total_files} | +{total_additions} / -{total_deletions}",
        f"Files (by review priority): {', '.join(c.file_path for c in chunks)}",
        f"{'=' * 40}\n",
    ]
    
    current_chars = sum(len(p) for p in parts)
    included = 0
    skipped_files = []
    
    for chunk in chunks:
        # Build per-file header
        header = (
            f"\n--- FILE: {chunk.file_path} ---\n"
            f"Language: {chunk.language} | "
            f"Changes: +{chunk.additions} / -{chunk.deletions}\n"
        )
        
        section = header + chunk.raw_diff + "\n"
        
        if current_chars + len(section) > max_chars:
            skipped_files.append(chunk.file_path)
            continue
        
        parts.append(section)
        current_chars += len(section)
        included += 1
    
    if skipped_files:
        parts.append(
            f"\n⚠️ {len(skipped_files)} file(s) omitted due to context limits: "
            f"{', '.join(skipped_files)}\n"
        )
    
    final_context = "\n".join(parts)
    
    # 🌟 PROMPT COMPRESSION PHASE 🌟
    if LLMLINGUA_AVAILABLE and compressor:
        print(f"DEBUG: Compressing diff of {len(final_context)} characters with LLMLingua...")
        try:
            compressed = compressor.compress_prompt(
                final_context,
                rate=0.6, # Keep 60% of tokens (strip 40% noise)
                force_tokens=["+", "-", "diff", "a/", "b/", "FILE:", "Language:"], # Don't strip core git demarcations
                chunk_end_tokens=[".", "\n"]
            )
            compressed_context = compressed.get("compressed_prompt", final_context)
            saved_ratio = compressed.get("saving", "")
            print(f"DEBUG: Compression finished. Savings: {saved_ratio}")
            return compressed_context
        except Exception as e:
            print(f"DEBUG: LLMLingua compression failed, using raw diff. Error: {e}")
            return final_context
            
    return final_context
