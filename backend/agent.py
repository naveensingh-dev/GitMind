"""
GitMind Agent Logic - Core Orchestration
This file defines the LangGraph state machine and LLM interaction logic.
It uses a Self-Critique & Refinement loop to ensure high-quality code reviews.
"""

import os
import httpx
import asyncio
from typing import Dict, TypedDict, List
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv

# Internal schema and prompt imports
from schemas import ReviewReport, CritiqueResult, AgentState
from prompts import REVIEWER_SYSTEM_PROMPT, CRITIQUE_SYSTEM_PROMPT, REFINEMENT_SYSTEM_PROMPT

# Load environment variables from .env
load_dotenv()

# --- UTILS ---

async def fetch_github_diff_text(url: str) -> str:
    """Helper to fetch raw diff text from GitHub."""
    clean_url = url.split("?")[0].rstrip("/")
    diff_url = clean_url if clean_url.endswith(".diff") else clean_url + ".diff"
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(diff_url, follow_redirects=True)
            if response.status_code == 200:
                return response.text
            # Fallback to .patch
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
        return ChatOpenAI(model=model_name, temperature=0, api_key=api_key, base_url="https://api.deepseek.com/v1")
    elif provider == "groq":
        return ChatOpenAI(model=model_name, temperature=0, api_key=api_key, base_url="https://api.groq.com/openai/v1")
    return None

async def invoke_llm(structured_class, state: AgentState, messages: List):
    """
    Business Logic Wrapper for LLM calls.
    Handles credential retrieval, sanitization, and execution.
    """
    provider = state.selected_provider or "gemini"
    model_name = state.selected_model or "gemini-1.5-flash"
    
    # Retrieve API key: Priority 1 (User Input), Priority 2 (Env Var)
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
            
        # Bind structured output schema to the LLM
        structured_llm = model.with_structured_output(structured_class)
        response = await structured_llm.ainvoke(messages)
        return response, model_name
    except Exception as e:
        print(f"DEBUG: Error with {model_name}: {str(e)}")
        raise e

# --- LANGGRAPH NODE DEFINITIONS ---

async def input_parse_node(state: AgentState):
    """Fetches the PR diff from GitHub if only a URL is provided."""
    print("Node: input_parse_node")
    url = state.github_url
    diff = state.diff
    
    if url and not diff:
        diff = await fetch_github_diff_text(url)

    if not diff:
        return {
            "status": "failed",
            "monologue": ["✗ Failed to retrieve code diff. Please check the URL or paste it manually."]
        }

    return {
        "diff": diff, 
        "status": "input_parsed",
        "monologue": ["✓ Successfully retrieved code diff from source."]
    }

async def initial_review_node(state: AgentState):
    """Performs the first-pass analysis of the code diff."""
    print("Node: initial_review_node")
    if not state.diff: 
        return {"status": "failed", "monologue": ["✗ No diff found to review."]}
    
    prompt = f"{REVIEWER_SYSTEM_PROMPT}\nAnalyze the following categories: Security, Performance, Style."
    messages = [
        SystemMessage(content=prompt), 
        HumanMessage(content=f"Review this PR diff:\n\n{state.diff}")
    ]
    
    response, used_model = await invoke_llm(ReviewReport, state, messages)
    
    return {
        "reviews": response, 
        "selected_model": used_model,
        "status": "review_complete",
        "monologue": [f"🔍 Initial review completed using {used_model}."]
    }

async def critique_node(state: AgentState):
    """The 'Critic' node evaluates the review for quality and accuracy."""
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

async def refinement_node(state: AgentState):
    """Refines the initial review based on critic feedback."""
    print("Node: refinement_node")
    review_json = state.reviews.model_dump_json()
    critique_json = state.critique.model_dump_json()
    
    messages = [
        SystemMessage(content=REFINEMENT_SYSTEM_PROMPT),
        HumanMessage(content=f"Review:\n{review_json}\nCritique:\n{critique_json}\nDiff:\n{state.diff}")
    ]
    
    response, used_model = await invoke_llm(ReviewReport, state, messages)
    
    return {
        "reviews": response, 
        "refinement_count": state.refinement_count + 1, 
        "status": "refinement_complete", 
        "monologue": ["🔄 Refinement cycle finished. Finding accuracy improved."]
    }

def should_refine(state: AgentState):
    """Conditional edge logic: decide whether to refine or end the process."""
    critique = state.critique
    # Trigger refinement if quality is low AND we haven't looped too many times
    if critique and critique.score < 80 and state.refinement_count < 2: 
        return "refine"
    return "end"

# --- WORKFLOW GRAPH CONSTRUCTION ---

workflow = StateGraph(AgentState)

# Add all reasoning nodes
workflow.add_node("input", input_parse_node)
workflow.add_node("review", initial_review_node)
workflow.add_node("critique", critique_node)
workflow.add_node("refine", refinement_node)

# Set execution flow
workflow.set_entry_point("input")
workflow.add_edge("input", "review")
workflow.add_edge("review", "critique")

# Conditional loop for refinement
workflow.add_conditional_edges(
    "critique", 
    should_refine, 
    {"refine": "refine", "end": END}
)
workflow.add_edge("refine", "critique")

# Compile the graph into an executable app
app_graph = workflow.compile()

