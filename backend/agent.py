"""
GitMind Agent Logic - Core Orchestration (Phase 2: GitHub Integration)
This file defines the LangGraph state machine and LLM interaction logic.
It uses a Dual-Pass Review → Arbitration → Self-Critique → Refinement pipeline
with repo-aware configuration and PR context enrichment.
"""

import os
import httpx
import asyncio
from typing import Dict, TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

# Internal schema and prompt imports
from schemas import ReviewReport, CritiqueResult, AgentState
from prompts import (
    REVIEWER_SYSTEM_PROMPT,
    PERSONA_SECURITY,
    PERSONA_PERFORMANCE,
    PERSONA_STYLE,
    ARBITRATOR_PROMPT,
    CRITIQUE_SYSTEM_PROMPT,
    REFINEMENT_SYSTEM_PROMPT,
)
from diff_parser import build_review_context
from config_loader import fetch_gitmind_config, filter_review_by_config
from github_context import fetch_pr_comments
from auto_fix import AutoFixReport, AUTO_FIX_PROMPT
from test_gen import GeneratedTestSuite, TEST_GEN_PROMPT
from arch_review import ArchReview, ARCH_REVIEW_PROMPT

# Load environment variables from .env
load_dotenv()

# --- UTILS ---

async def fetch_github_diff_text(url: str) -> str:
    """
    Helper to fetch raw diff text from GitHub.
    Handles redirection and appends .diff extension if necessary.
    """
    clean_url = url.split("?")[0].rstrip("/")
    diff_url = clean_url if clean_url.endswith(".diff") else clean_url + ".diff"
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(diff_url, follow_redirects=True)
            if response.status_code == 200:
                return response.text
            # Fallback to .patch if .diff is not available
            patch_url = clean_url + ".patch"
            response = await client.get(patch_url, follow_redirects=True)
            if response.status_code == 200:
                return response.text
        except Exception as e:
            print(f"Error fetching diff: {e}")
    return ""

# --- LLM FACTORY METHODS ---

def get_model_instance(provider: str, model_name: str, api_key: str):
    """
    Creates a specific LLM instance based on the provider and model name.
    Supports Gemini Research Tier, OpenAI, Anthropic, DeepSeek, and Groq.
    """
    if provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model_name, 
            temperature=0,
            google_api_key=api_key,
            safety_settings={
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
            }
        )
    elif provider == "anthropic":
        return ChatAnthropic(model=model_name, temperature=0, api_key=api_key)
    elif provider == "openai":
        return ChatOpenAI(model=model_name, temperature=0, api_key=api_key)
    elif provider == "deepseek":
        # DeepSeek is compatible with the OpenAI API format
        return ChatOpenAI(model=model_name, temperature=0, api_key=api_key, base_url="https://api.deepseek.com/v1")
    elif provider == "groq":
        # Groq is compatible with the OpenAI API format
        return ChatOpenAI(model=model_name, temperature=0, api_key=api_key, base_url="https://api.groq.com/openai/v1")
    return None

def should_retry(exception):
    """Do not retry if it's a Quota / Rate Limit / Resource Exhausted error or Auth error."""
    error_str = str(exception).lower()
    if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str:
        return False
    if "401" in error_str or "403" in error_str or "authentication" in error_str:
        return False
    return True

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3), retry=retry_if_exception(should_retry), reraise=True)
async def invoke_llm(structured_class, state: AgentState, messages: List):
    """
    Business Logic Wrapper for LLM calls.
    Handles credential retrieval, sanitization, and execution with retry logic.
    """
    provider = state.selected_provider or "gemini"
    model_name = state.selected_model or "gemini-1.5-flash"
    
    # Retrieve API key: Priority 1 (State/User Input), Priority 2 (Env Var)
    user_key = state.api_key
    raw_key = user_key or os.getenv(f"{provider.upper()}_API_KEY") or os.getenv("GOOGLE_API_KEY")
    api_key = raw_key.strip() if raw_key else None
    
    if not api_key:
        raise ValueError(f"Missing API Key for {provider.upper()}. Please provide it in the UI.")

    try:
        print(f"DEBUG: Invoking {provider} / {model_name}...")
        model = get_model_instance(provider, model_name, api_key)
        if not model:
            raise ValueError(f"Unsupported provider: {provider}")
            
        # Bind structured output schema to the LLM (ensure response follows our Pydantic classes)
        structured_llm = model.with_structured_output(structured_class)
        response = await structured_llm.ainvoke(messages)
        return response, model_name
    except Exception as e:
        print(f"DEBUG: Error with {model_name}: {str(e)}")
        raise e

# --- LANGGRAPH NODE DEFINITIONS ---

async def input_parse_node(state: AgentState):
    """
    Initial node: Validates input, fetches the PR diff if needed,
    loads .gitmind.yaml config, fetches PR comments, and applies smart diff chunking.
    """
    print("Node: input_parse_node")
    url = state.github_url
    diff = state.diff
    monologue = []
    updates = {}
    
    if url and not diff:
        diff = await fetch_github_diff_text(url)

    if not diff:
        return {
            "status": "failed",
            "monologue": ["✗ Failed to retrieve code diff. Please check the URL or paste it manually."]
        }

    # Phase 2: Fetch .gitmind.yaml from the repo
    if url:
        try:
            config = await fetch_gitmind_config(url, state.api_key)
            if config:
                updates["repo_config"] = config.model_dump()
                updates["ignore_paths"] = config.ignore_paths
                updates["severity_threshold"] = config.severity_threshold
                updates["custom_instructions"] = config.custom_instructions
                # Override model/provider if config specifies them and user didn't set manually
                if config.provider:
                    updates["selected_provider"] = config.provider
                if config.model:
                    updates["selected_model"] = config.model
                monologue.append(f"📋 Loaded .gitmind.yaml config from repo (threshold: {config.severity_threshold}, ignoring {len(config.ignore_paths)} path pattern(s)).")
            else:
                monologue.append("ℹ️ No .gitmind.yaml found — using default settings.")
        except Exception as e:
            monologue.append(f"⚠️ Could not fetch .gitmind.yaml: {str(e)[:60]}")
    
    # Phase 2: Fetch existing PR comments for context
    if url:
        try:
            pr_context = await fetch_pr_comments(url)
            if pr_context:
                updates["pr_context"] = pr_context
                comment_count = pr_context.count("•")
                monologue.append(f"💬 Loaded {comment_count} existing PR comment(s) as review context.")
        except Exception as e:
            monologue.append(f"⚠️ Could not fetch PR comments: {str(e)[:60]}")

    # Apply smart diff chunking — structures raw diff with metadata headers
    structured_diff = build_review_context(diff)
    monologue.append("✓ Successfully retrieved and structured code diff from source.")

    updates.update({
        "diff": structured_diff, 
        "status": "input_parsed",
        "monologue": monologue,
    })
    return updates


async def multi_review_node(state: AgentState):
    """
    Multi-Review Persona Node (Phase 4.1): Runs fully independent, customized 
    concurrent review passes based on .gitmind.yaml's "focus" configuration.
    """
    print("Node: multi_review_node")
    if not state.diff: 
        return {"status": "failed", "monologue": ["✗ No diff found to review."]}
    
    diff_content = state.diff
    
    # Build enriched prompts with config + PR context
    extra_context = ""
    if state.custom_instructions:
        extra_context += f"\n\nPROJECT-SPECIFIC INSTRUCTIONS FROM .gitmind.yaml:\n{state.custom_instructions}\n"
    if state.pr_context:
        extra_context += f"\n\n{state.pr_context}\n"
        
    config = state.repo_config or {}
    focus_areas = config.get("focus", ["security", "performance", "style"])
    if not focus_areas:
        focus_areas = ["security", "performance", "style"]
        
    persona_prompts = {
        "security": PERSONA_SECURITY,
        "performance": PERSONA_PERFORMANCE,
        "style": PERSONA_STYLE
    }
    
    tasks = []
    monologue = []
    monologue.append(f"🔍 Launching dynamic multi-persona review for: {', '.join(focus_areas)}...")
    
    for focus in focus_areas:
        if focus in persona_prompts:
            messages = [
                SystemMessage(content=persona_prompts[focus] + extra_context),
                HumanMessage(content=f"Review this PR diff for {focus} issues ONLY:\n\n{diff_content}")
            ]
            tasks.append(invoke_llm(ReviewReport, state, messages))

    if not tasks:
        # Fallback if config is weird
        messages = [
            SystemMessage(content=persona_prompts["security"] + extra_context),
            HumanMessage(content=f"Review this PR diff:\n\n{diff_content}")
        ]
        tasks.append(invoke_llm(ReviewReport, state, messages))
    
    try:
        results = await asyncio.gather(*tasks)
        passes = []
        selected_model = None
        for i, (report, model_used) in enumerate(results):
            passes.append(report)
            selected_model = model_used
            
            # Add to monologue
            focus_name = focus_areas[i].capitalize() if i < len(focus_areas) else "Fallback"
            count = len(report.security) + len(report.performance) + len(report.style)
            monologue.append(f"✓ \"The {focus_name}\" persona completed — found {count} finding(s) using {model_used}.")
            
        return {
            "review_passes": passes,
            "selected_model": selected_model,
            "status": "multi_review_complete",
            "monologue": monologue,
        }
    except Exception as e:
        monologue.append(f"⚠️ Multi-persona review failed ({str(e)[:60]}...).")
        raise e


async def arbitrate_node(state: AgentState):
    """
    Arbitrator Node: Merges findings from ALL dynamic review passes into a single
    unified ReviewReport. Deduplicates issues and assigns confidence scores.
    """
    print("Node: arbitrate_node")
    
    passes = state.review_passes or []
    
    if not passes:
        return {"status": "failed", "monologue": ["✗ No review passes available to merge."]}
    
    if len(passes) == 1:
        return {"reviews": passes[0], "status": "arbitrate_complete", 
                "monologue": ["🔀 Only one persona pass available — using directly as final review."]}
    
    # Build context for the arbitrator LLM
    pass_context = ""
    for i, p in enumerate(passes):
        pass_context += f"=== PASS {i+1} RESULTS ===\n{p.model_dump_json()}\n\n"
        
    messages = [
        SystemMessage(content=ARBITRATOR_PROMPT),
        HumanMessage(content=(
            f"{pass_context}"
            f"=== ORIGINAL DIFF ===\n{state.diff}\n\n"
            f"Merge these passes into a single unified ReviewReport. "
            f"Deduplicate overlapping findings and assign confidence scores."
        ))
    ]
    
    response, used_model = await invoke_llm(ReviewReport, state, messages)
    
    # Count merged stats
    total = len(response.security) + len(response.performance) + len(response.style)
    
    return {
        "reviews": response, 
        "status": "arbitrate_complete",
        "monologue": [
            f"🔀 Arbitration complete — merged {len(passes)} passes into {total} unique finding(s).",
            f"📊 Final confidence score: {response.confidence_score}%"
        ]
    }

async def enhance_node(state: AgentState):
    """
    Phase 3: Agentic Capabilities Node.
    Runs Auto-Fix generation, Test generation, and Architecture Review concurrently.
    """
    print("Node: enhance_node")
    if not state.diff or not state.reviews:
        return {"status": "enhance_skipped"}
        
    diff_content = state.diff
    review_json = state.reviews.model_dump_json()
    
    # Generate prompts
    fix_messages = [
        SystemMessage(content=AUTO_FIX_PROMPT),
        HumanMessage(content=f"Diff:\n{diff_content}\n\nReview Findings:\n{review_json}")
    ]
    test_messages = [
        SystemMessage(content=TEST_GEN_PROMPT),
        HumanMessage(content=f"Generate unit tests for the changed functions in this diff:\n\n{diff_content}")
    ]
    arch_messages = [
        SystemMessage(content=ARCH_REVIEW_PROMPT),
        HumanMessage(content=f"Analyze the architecture and generate a Mermaid diagram for this diff:\n\n{diff_content}")
    ]
    
    monologue = []
    try:
        monologue.append("🚀 Launching agentic capabilities (Auto-Fix, Tests, Architecture)...")
        # Run all three concurrently
        fix_res, test_res, arch_res = await asyncio.gather(
            invoke_llm(AutoFixReport, state, fix_messages),
            invoke_llm(GeneratedTestSuite, state, test_messages),
            invoke_llm(ArchReview, state, arch_messages),
            return_exceptions=True
        )
        
        updates = {}
        
        if not isinstance(fix_res, Exception):
            updates["auto_fixes"] = fix_res[0]
            monologue.append(f"🔧 Generated {len(fix_res[0].fixes)} auto-fix patch(es).")
        else:
            monologue.append(f"⚠️ Auto-fix generation failed: {fix_res}")
            
        if not isinstance(test_res, Exception):
            updates["generated_tests"] = test_res[0]
            monologue.append(f"🧪 Generated {len(test_res[0].tests)} unit test(s).")
        else:
            monologue.append(f"⚠️ Test generation failed: {test_res}")
            
        if not isinstance(arch_res, Exception):
            updates["arch_review"] = arch_res[0]
            monologue.append(f"🏗️ Generated architecture review ({len(arch_res[0].observations)} observations).")
        else:
            monologue.append(f"⚠️ Architecture review failed: {arch_res}")
            
        updates["status"] = "enhance_complete"
        updates["monologue"] = monologue
        return updates
        
    except Exception as e:
        return {"status": "enhance_failed", "monologue": [f"✗ Enhancement phase failed: {e}"]}


async def critique_node(state: AgentState):
    """
    Critic node: Evaluates the arbitrated review for quality, accuracy, and constructiveness.
    """
    print("Node: critique_node")
    if not state.self_critique: 
        return {"status": "critique_skipped", "monologue": ["⏩ Self-critique skipped."]}
    
    review_json = state.reviews.model_dump_json()
    messages = [
        SystemMessage(content=CRITIQUE_SYSTEM_PROMPT),
        HumanMessage(content=f"Diff:\n{state.diff}\n\nReview:\n{review_json}")
    ]
    
    response, used_model = await invoke_llm(CritiqueResult, state, messages)
    msg = f"🧠 Self-Critique score: {response.score}/100."
    
    return {"critique": response, "status": "critique_complete", "monologue": [msg]}

async def human_review_node(state: AgentState):
    """
    Human-in-the-loop node: Interrupts execution to wait for human feedback.
    """
    print("Node: human_review_node")
    return {"status": "awaiting_feedback", "monologue": ["✋ Agent paused. Waiting for human refinement..."]}

async def refinement_node(state: AgentState):
    """
    Refinement node: Updates the review based on AI critique and Human feedback.
    """
    print("Node: refinement_node")
    review_json = state.reviews.model_dump_json()
    critique_json = state.critique.model_dump_json() if state.critique else "{}"
    human_feedback = state.human_feedback or "No human feedback provided."
    
    messages = [
        SystemMessage(content=REFINEMENT_SYSTEM_PROMPT),
        HumanMessage(content=f"Review:\n{review_json}\nAI Critique:\n{critique_json}\nHuman Feedback:\n{human_feedback}\nDiff:\n{state.diff}")
    ]
    
    response, used_model = await invoke_llm(ReviewReport, state, messages)
    
    return {
        "reviews": response, 
        "refinement_count": state.refinement_count + 1, 
        "human_feedback": None, # Reset feedback for next cycle
        "status": "refinement_complete", 
        "monologue": ["🔄 Refinement cycle finished. Incorporated feedback for improved accuracy."]
    }

def should_refine(state: AgentState):
    """
    Conditional logic for the state machine loop.
    Triggers refinement if human feedback exists or if the AI critique score is low.
    """
    if state.human_feedback:
        return "refine"
        
    critique = state.critique
    # Refine if score < 80 and we haven't exceeded 2 refinement cycles
    if critique and critique.score < 80 and state.refinement_count < 2: 
        return "refine"
    return "end"

# --- WORKFLOW GRAPH CONSTRUCTION ---

workflow = StateGraph(AgentState)

# Define the nodes in our graph (Phase 1: Dual-Pass + Arbitrator)
workflow.add_node("input", input_parse_node)
workflow.add_node("multi_review", multi_review_node)
workflow.add_node("arbitrate", arbitrate_node)
workflow.add_node("enhance", enhance_node)
workflow.add_node("critique", critique_node)
workflow.add_node("human_review", human_review_node)
workflow.add_node("refine", refinement_node)

# Connect the nodes: input → multi_review → arbitrate → enhance → critique → human_review
workflow.set_entry_point("input")
workflow.add_edge("input", "multi_review")
workflow.add_edge("multi_review", "arbitrate")
workflow.add_edge("arbitrate", "enhance")
workflow.add_edge("enhance", "critique")
workflow.add_edge("critique", "human_review")

# Add loop logic with conditional edges
workflow.add_conditional_edges(
    "human_review", 
    should_refine, 
    {"refine": "refine", "end": END}
)
workflow.add_edge("refine", "critique")

# Initialize persistence
from langgraph.checkpoint.memory import MemorySaver
memory = MemorySaver()

# Compile the graph into an executable application
# We interrupt_before human_review to enable human feedback via the UI
app_graph = workflow.compile(checkpointer=memory, interrupt_before=["human_review"])
