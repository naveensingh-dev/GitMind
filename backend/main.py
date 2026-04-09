import json
import asyncio
import uuid
import re
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from agent import app_graph, fetch_github_diff_text
from schemas import AgentState, ReviewItem, ReviewReport
from pydantic import BaseModel

app = FastAPI(title="GitMind API")

# Enable CORS for Angular
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GithubCommentRequest(BaseModel):
    github_url: str
    item: ReviewItem
    github_token: str

@app.get("/fetch-diff")
async def fetch_github_diff(url: str):
    """Fetches raw diff from a GitHub PR or Commit URL."""
    if "github.com" not in url:
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported")

    diff = await fetch_github_diff_text(url)
    if diff:
        return {"diff": diff}
    
    raise HTTPException(status_code=404, detail="Failed to fetch diff. Ensure the URL is public and valid.")

def parse_github_pr_url(url: str):
    """Parses owner, repo, and pull_number from a GitHub PR URL."""
    match = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", url)
    if not match:
        return None, None, None
    return match.groups()

async def get_latest_commit_sha(owner: str, repo: str, pull_number: str, token: str):
    """Fetches the latest commit SHA for a PR."""
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return response.json().get("head", {}).get("sha")
    return None

async def push_status_to_github(github_url: str, token: str, state: str, description: str, target_url: str = ""):
    """Pushes a commit status to GitHub."""
    owner, repo, pull_number = parse_github_pr_url(github_url)
    if not owner:
        return
    
    sha = await get_latest_commit_sha(owner, repo, pull_number, token)
    if not sha:
        return

    url = f"https://api.github.com/repos/{owner}/{repo}/statuses/{sha}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    payload = {
        "state": state,
        "description": description,
        "context": "GitMind Review",
        "target_url": target_url
    }
    async with httpx.AsyncClient() as client:
        await client.post(url, headers=headers, json=payload)

@app.post("/analyze")
async def analyze_pr(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    thread_id = data.get("thread_id") or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    github_url = data.get("github_url")
    github_token = data.get("github_token")

    try:
        initial_state = AgentState(
            diff=data.get("diff", ""),
            github_url=github_url,
            security_scan=data.get("security_scan", True),
            perf_analysis=data.get("perf_analysis", True),
            style_review=data.get("style_review", True),
            self_critique=data.get("self_critique", True),
            selected_provider=data.get("selected_provider", "gemini"),
            selected_model=data.get("selected_model", "gemini-1.5-flash"),
            api_key=data.get("api_key"),
            status="started"
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid state data: {str(e)}")

    async def event_generator():
        yield f"data: {json.dumps({'thread_id': thread_id})}\n\n"
        
        if github_url and github_token:
            await push_status_to_github(github_url, github_token, "pending", "GitMind is analyzing the PR...")

        try:
            final_reviews = None
            async for event in app_graph.astream(initial_state.model_dump(), config=config):
                if not event:
                    continue
                    
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                if state_update.get("reviews"):
                    rev = state_update.get("reviews")
                    if isinstance(rev, dict):
                        final_reviews = ReviewReport(**rev)
                    else:
                        final_reviews = rev

                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "monologue": state_update.get("monologue", []),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05)
            
            if github_url and github_token and final_reviews:
                high_sev = [i for cat in ['security', 'performance', 'style'] 
                           for i in getattr(final_reviews, cat) if i.severity == 'high']
                
                state = "failure" if high_sev else "success"
                desc = f"Found {len(high_sev)} high severity issues." if high_sev else "No high severity issues found."
                if final_reviews.approval_status == "approved" and not high_sev:
                    state = "success"
                elif final_reviews.approval_status == "rejected":
                    state = "failure"
                
                await push_status_to_github(github_url, github_token, state, desc)

        except Exception as e:
            if github_url and github_token:
                await push_status_to_github(github_url, github_token, "error", f"Analysis failed: {str(e)}")
            error_payload = {"node": "error", "status": "failed", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/feedback")
async def provide_feedback(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    thread_id = data.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")
    
    feedback = data.get("feedback")
    config = {"configurable": {"thread_id": thread_id}}

    await app_graph.aupdate_state(config, {"human_feedback": feedback})

    async def event_generator():
        try:
            async for event in app_graph.astream(None, config=config):
                if not event:
                    continue
                    
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "monologue": state_update.get("monologue", []),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05)
        except Exception as e:
            error_payload = {"node": "error", "status": "failed", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/push-to-github")
async def push_to_github(req: GithubCommentRequest):
    owner, repo, pull_number = parse_github_pr_url(req.github_url)
    if not owner:
        raise HTTPException(status_code=400, detail="Invalid GitHub PR URL")
    
    commit_sha = await get_latest_commit_sha(owner, repo, pull_number, req.github_token)
    if not commit_sha:
        raise HTTPException(status_code=400, detail="Failed to fetch latest commit SHA from GitHub")

    # Use GitHub "Suggested Change" format
    comment_body = f"**GitMind Suggestion:** {req.item.issue}\n\n```suggestion\n{req.item.fix}\n```"
    
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/comments"
    headers = {
        "Authorization": f"token {req.github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    payload = {
        "body": comment_body,
        "commit_id": commit_sha,
        "path": req.item.file_path,
        "line": req.item.line_number,
        "side": "RIGHT"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code == 201:
            return {"status": "success", "comment_url": response.json().get("html_url")}
        else:
            error_detail = response.json()
            raise HTTPException(status_code=response.status_code, detail=f"GitHub API Error: {error_detail}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
