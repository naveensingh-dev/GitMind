import os
import httpx
from typing import Dict, TypedDict, List
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv

from schemas import ReviewReport, CritiqueResult, AgentState
from prompts import REVIEWER_SYSTEM_PROMPT, CRITIQUE_SYSTEM_PROMPT, REFINEMENT_SYSTEM_PROMPT

load_dotenv()

# Choose LLM based on environment
def get_model(structured_output_class):
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    google_key = os.getenv("GOOGLE_API_KEY")

    if anthropic_key:
        print("Using Anthropic Model")
        model = ChatAnthropic(model="claude-3-5-sonnet-20240620", temperature=0)
    elif openai_key:
        print("Using OpenAI Model")
        model = ChatOpenAI(model="gpt-4o", temperature=0)
    elif google_key:
        # Switching to gemini-2.5-flash based on your account's available model list
        print("Initializing Gemini Model: gemini-2.5-flash")
        model = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            temperature=0,
            safety_settings={
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
            }
        )
    else:
        raise ValueError("Missing API Key: Please set GOOGLE_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY in backend/.env")

    return model.with_structured_output(structured_output_class)

async def input_parse_node(state: Dict):
    print("Node: input_parse_node")
    url = state.get("github_url")
    diff = state.get("diff", "")
    
    if url and not diff:
        print(f"Fetching diff for URL: {url}")
        clean_url = url.split("?")[0].rstrip("/")
        if not clean_url.endswith(".diff"):
            diff_url = clean_url + ".diff"
        else:
            diff_url = clean_url
            
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.get(diff_url, follow_redirects=True)
                if response.status_code == 200:
                    diff = response.text
                else:
                    print(f"Failed to fetch diff: {response.status_code}")
                    patch_url = clean_url + ".patch"
                    response = await client.get(patch_url, follow_redirects=True)
                    if response.status_code == 200:
                        diff = response.text
            except Exception as e:
                print(f"Fetch error: {e}")

    return {"diff": diff, "status": "input_parsed"}

async def initial_review_node(state: Dict):
    print("Node: initial_review_node")
    if not state.get("diff"):
        return {"status": "review_failed_no_diff"}
        
    model = get_model(ReviewReport)
    
    categories = []
    if state.get("security_scan"): categories.append("Security")
    if state.get("perf_analysis"): categories.append("Performance")
    if state.get("style_review"): categories.append("Style")
    
    prompt = f"{REVIEWER_SYSTEM_PROMPT}\nCategories to analyze: {', '.join(categories)}"
    
    print("Invoking LLM for initial review...")
    response = await model.ainvoke([
        SystemMessage(content=prompt),
        HumanMessage(content=f"Review this PR diff:\n\n{state['diff']}")
    ])
    print("LLM review complete")
    
    return {"reviews": response, "status": "review_complete"}

async def critique_node(state: Dict):
    print("Node: critique_node")
    if not state.get("self_critique"):
        return {"status": "critique_skipped"}
        
    model = get_model(CritiqueResult)
    review_json = state["reviews"].model_dump_json()
    
    print("Invoking LLM for critique...")
    response = await model.ainvoke([
        SystemMessage(content=CRITIQUE_SYSTEM_PROMPT),
        HumanMessage(content=f"Diff:\n{state['diff']}\n\nReview:\n{review_json}")
    ])
    print("LLM critique complete")
    
    return {"critique": response, "status": "critique_complete"}

async def refinement_node(state: Dict):
    print("Node: refinement_node")
    model = get_model(ReviewReport)
    review_json = state["reviews"].model_dump_json()
    critique_json = state["critique"].model_dump_json()
    
    print("Invoking LLM for refinement...")
    response = await model.ainvoke([
        SystemMessage(content=REFINEMENT_SYSTEM_PROMPT),
        HumanMessage(content=f"Initial Review:\n{review_json}\n\nCritic Feedback:\n{critique_json}\n\nOriginal Diff:\n{state['diff']}")
    ])
    print("LLM refinement complete")
    
    return {
        "reviews": response, 
        "refinement_count": state.get("refinement_count", 0) + 1,
        "status": "refinement_complete"
    }

def should_refine(state: Dict):
    if not state.get("self_critique"):
        return "end"
    
    critique = state.get("critique")
    if critique and critique.score < 80 and state.get("refinement_count", 0) < 2:
        print(f"Refinement triggered! Score: {critique.score}")
        return "refine"
    return "end"

# Build the Graph
workflow = StateGraph(dict)
workflow.add_node("input", input_parse_node)
workflow.add_node("review", initial_review_node)
workflow.add_node("critique", critique_node)
workflow.add_node("refine", refinement_node)

workflow.set_entry_point("input")
workflow.add_edge("input", "review")
workflow.add_edge("review", "critique")

workflow.add_conditional_edges(
    "critique",
    should_refine,
    {"refine": "refine", "end": END}
)
workflow.add_edge("refine", "critique")

app_graph = workflow.compile()
