import json
import asyncio
import uuid
import re
import httpx
import hashlib
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from agent import app_graph, fetch_github_diff_text
from schemas import AgentState, ReviewItem, ReviewReport
from pydantic import BaseModel, ValidationError
from history import save_analysis, get_history, get_analysis_by_id, add_suppression, get_suppressed_issues, get_cached_analysis, queue_repo_for_scan, update_scan_status

app = FastAPI(title="GitMind API")

# Enable CORS for Angular
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
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

def parse_github_url(url: str):
    """
    Extracts owner, repo, and identifier (pull number or commit SHA) from a GitHub URL.
    Supports both Pull Request URLs and individual Commit URLs.
    
    Returns:
        tuple: (owner, repo, pull_number, commit_sha)
    """
    # Pattern for Pull Requests: github.com/owner/repo/pull/number
    pr_match = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", url)
    if pr_match:
        owner, repo, pull_number = pr_match.groups()
        return owner, repo, pull_number, None
    
    # Pattern for Commits: github.com/owner/repo/commit/sha
    commit_match = re.search(r"github\.com/([^/]+)/([^/]+)/commit/([a-f0-9]+)", url)
    if commit_match:
        owner, repo, commit_sha = commit_match.groups()
        return owner, repo, None, commit_sha
        
    return None, None, None, None

async def get_latest_commit_sha(owner: str, repo: str, pull_number: str, token: str):
    """
    Queries the GitHub API to find the latest (head) commit SHA for a specific Pull Request.
    This is required for posting comments to the correct version of the code.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            return response.json().get("head", {}).get("sha")
    return None

async def push_status_to_github(github_url: str, token: str, state: str, description: str, target_url: str = ""):
    """
    Updates the GitHub 'Commit Status' for the relevant commit.
    This provides visual feedback (checkmarks/crosses) directly on the GitHub UI.
    
    Args:
        state: One of 'pending', 'success', 'error', 'failure'
    """
    owner, repo, pull_number, commit_sha = parse_github_url(github_url)
    if not owner:
        return
    
    # If it's a PR, we need the latest SHA; otherwise use the direct commit SHA
    sha = commit_sha
    if pull_number:
        sha = await get_latest_commit_sha(owner, repo, pull_number, token)
    
    if not sha:
        return

    url = f"https://api.github.com/repos/{owner}/{repo}/statuses/{sha}"
    headers = {
        "Authorization": f"Bearer {token}",
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
    """
    Main entry point for starting a code review analysis.
    Streams events from the LangGraph agent back to the client using Server-Sent Events (SSE).
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Use existing thread_id for state persistence or generate a new one
    thread_id = data.get("thread_id") or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    github_url = data.get("github_url")
    github_token = data.get("github_token")

    # Construct the initial agent state from request parameters
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

    diff_hash = hashlib.sha256(f"{initial_state.diff}_{initial_state.selected_provider}_{initial_state.selected_model}".encode()).hexdigest()

    async def event_generator():
        """Generator for Server-Sent Events."""
        yield f"data: {json.dumps({'thread_id': thread_id})}\n\n"
        
        # Post 'pending' status to GitHub if credentials provided
        if github_url and github_token:
            await push_status_to_github(github_url, github_token, "pending", "GitMind is analyzing the changes...")

        # --- CACHE INTERCEPTOR ---
        cached_analysis = get_cached_analysis(diff_hash, initial_state.selected_model, initial_state.selected_provider)
        if cached_analysis and cached_analysis.get("review_data"):
            print(f"DEBUG: Cache HIT for {diff_hash}!")
            payload = {
                "node": "arbitrate",
                "status": "arbitrate_complete",
                "reviews": cached_analysis["review_data"],
                "monologue": ["⚡ Semantic Cache Hit! Returning instantly."],
                "tokens_saved": 0
            }
            yield f"data: {json.dumps(payload)}\n\n"
            
            # Auto-approve simulated github status
            if github_url and github_token:
                await push_status_to_github(github_url, github_token, "success", "Analysis loaded from cache.")
                
            return  # Stop execution completely
            
        try:
            final_reviews = None
            # Stream events from the LangGraph agent
            async for event in app_graph.astream(initial_state.model_dump(), config=config):
                if not event:
                    continue
                    
                # Skip internal LangGraph interrupt signals
                if "__interrupt__" in event:
                    continue
                
                # Extract state update from the active node
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                # Keep track of the final review report for GitHub status update
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
                    "tokens_saved": state_update.get("tokens_saved", 0),
                    "monologue": state_update.get("monologue", []),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None,
                    "auto_fixes": state_update.get("auto_fixes").model_dump() if state_update.get("auto_fixes") else None,
                    "generated_tests": state_update.get("generated_tests").model_dump() if state_update.get("generated_tests") else None,
                    "arch_review": state_update.get("arch_review").model_dump() if state_update.get("arch_review") else None
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05) # Small delay for smoother UI updates
            
            # Finalize GitHub status based on review findings
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
            
            # Phase 2: Auto-save analysis to history
            if final_reviews and github_url:
                try:
                    save_analysis(
                        github_url=github_url,
                        model=initial_state.selected_model,
                        provider=initial_state.selected_provider,
                        review_report=final_reviews.model_dump(),
                        diff_hash=diff_hash,
                        diff_text=initial_state.diff,
                        api_key=initial_state.api_key,
                        github_token=github_token
                    )
                except Exception as e:
                    print(f"DEBUG: Failed to save analysis history: {e}")

        except Exception as e:
            # Handle and report errors during agent execution
            if github_url and github_token:
                await push_status_to_github(github_url, github_token, "error", f"Analysis failed: {str(e)}")
            error_payload = {"node": "error", "status": "failed", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def batch_worker_task(repo_url: str, provider: str, model: str, scan_id: int):
    """Background worker to silently process queued repositories."""
    diff = await fetch_github_diff_text(repo_url)
    if not diff:
        update_scan_status(scan_id, 'failed_no_diff')
        return

    # Simulate basic state for silent job
    initial_state = AgentState(
        diff=diff,
        github_url=repo_url,
        security_scan=True,
        perf_analysis=True,
        style_review=True,
        self_critique=True,
        selected_provider=provider,
        selected_model=model,
        status="started"
    )
    
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    
    try:
        final_reviews = None
        async for event in app_graph.astream(initial_state.model_dump(), config=config):
            if not event or "__interrupt__" in event:
                continue
            
            node_name = list(event.keys())[0]
            if event[node_name].get("reviews"):
                rev = event[node_name].get("reviews")
                final_reviews = ReviewReport(**rev) if isinstance(rev, dict) else rev
                
        if final_reviews:
            diff_hash = hashlib.sha256(f"{diff}_{provider}_{model}".encode()).hexdigest()
            save_analysis(
                github_url=repo_url,
                model=model,
                provider=provider,
                review_report=final_reviews.model_dump(),
                diff_hash=diff_hash,
                diff_text=diff,
                api_key=None,  # Batch process may not have individual user keys immediately
                github_token=None
            )
            update_scan_status(scan_id, 'completed')
        else:
            update_scan_status(scan_id, 'failed')
            
    except Exception as e:
        print(f"Batch Worker Failed for {repo_url}: {e}")
        update_scan_status(scan_id, 'error')


@app.post("/batch_scan")
async def queue_batch_scan(request: Request, background_tasks: BackgroundTasks):
    """Queues a repository for asynchronous overnight scanning."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    repo_urls = data.get("repo_urls", [])
    provider = data.get("provider", "gemini")
    model = data.get("model", "gemini-1.5-flash")
    
    if not repo_urls:
        raise HTTPException(status_code=400, detail="repo_urls missing")
        
    queued_jobs = []
    for url in repo_urls:
        scan_id = queue_repo_for_scan(url, provider, model)
        background_tasks.add_task(batch_worker_task, url, provider, model, scan_id)
        queued_jobs.append(scan_id)
        
    return {"status": "queued", "queued_jobs": len(queued_jobs)}

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
                
                if "__interrupt__" in event:
                    continue
                    
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "tokens_saved": state_update.get("tokens_saved", 0),
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
    owner, repo, pull_number, commit_sha = parse_github_url(req.github_url)
    if not owner:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL. Must be a PR or Commit URL.")
    
    sha = commit_sha
    if pull_number:
        sha = await get_latest_commit_sha(owner, repo, pull_number, req.github_token)
    
    if not sha:
        raise HTTPException(status_code=400, detail="Failed to fetch commit SHA from GitHub")

    # Use GitHub "Suggested Change" format
    comment_body = f"**GitMind Suggestion:** {req.item.issue}\n\n```suggestion\n{req.item.fix}\n```"
    
    if pull_number:
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/comments"
        payload = {
            "body": comment_body,
            "commit_id": sha,
            "path": req.item.file_path,
            "line": req.item.line_number,
            "side": "RIGHT"
        }
    else:
        # Commit comment (generic)
        url = f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}/comments"
        payload = {
            "body": comment_body,
            "path": req.item.file_path,
            "line": req.item.line_number
        }

    headers = {
        "Authorization": f"Bearer {req.github_token}",
        "Accept": "application/vnd.github.v3+json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code == 201:
            return {"status": "success", "comment_url": response.json().get("html_url")}
        else:
            error_detail = response.json()
            raise HTTPException(status_code=response.status_code, detail=f"GitHub API Error: {error_detail}")

@app.post("/apply-fix")
async def apply_fix(request: Request):
    """Pushes a generated code patch to the GitHub PR branch."""
    import base64
    import re
    data = await request.json()
    github_url = data.get("github_url")
    github_token = data.get("github_token")
    file_path = data.get("file_path")
    original_code = data.get("original_code", "")
    fixed_code = data.get("fixed_code")
    commit_msg = data.get("commit_message", f"Auto-Fix: {file_path}")
    
    if not all([github_url, github_token, file_path, fixed_code]):
        raise HTTPException(status_code=400, detail="Missing required parameters")
        
    owner, repo, pr_number, commit_sha = parse_github_url(github_url)
    
    if not owner or not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL provided.")
    
    if not pr_number:
        raise HTTPException(status_code=400, detail="Cannot apply fix: Please provide a Pull Request URL (not a Commit URL) so GitMind knows which branch to push to.")
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Get PR details to find branch name
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        pr_res = await client.get(pr_url, headers=headers)
        if pr_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch PR details")
            
        branch = pr_res.json().get("head", {}).get("ref")
        if not branch:
            raise HTTPException(status_code=400, detail="Could not find PR branch")
            
        # 2. Get file SHA on that branch
        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}?ref={branch}"
        file_res = await client.get(file_url, headers=headers)
        if file_res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"File {file_path} not found on branch {branch}")
            
        file_sha = file_res.json().get("sha")
        
        # 3. Update file with commit
        update_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
        
        old_content_b64 = file_res.json().get("content", "")
        if not old_content_b64:
            blob_url_fetch = file_res.json().get("git_url")
            if blob_url_fetch:
                blob_res_fetch = await client.get(blob_url_fetch, headers=headers)
                old_content_b64 = blob_res_fetch.json().get("content", "")
                
        old_content = base64.b64decode(old_content_b64).decode("utf-8") if old_content_b64 else ""
        
        if original_code and original_code in old_content:
            new_content = old_content.replace(original_code, fixed_code)
        elif original_code.strip() and original_code.strip() in old_content:
            new_content = old_content.replace(original_code.strip(), fixed_code.strip())
        else:
            new_content = old_content.replace(original_code, fixed_code) if original_code else fixed_code

        encoded_content = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": commit_msg,
            "content": encoded_content,
            "sha": file_sha,
            "branch": branch
        }
        
        update_res = await client.put(update_url, headers=headers, json=payload)
        if update_res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to push commit: {update_res.text}")
            
        return {"message": "Fix applied successfully", "commit_url": update_res.json().get("commit", {}).get("html_url")}

@app.post("/batch-apply-fixes")
async def batch_apply_fixes(request: Request):
    """Pushes an array of code patches to the GitHub PR branch as a single batch commit."""
    import base64
    import re
    data = await request.json()
    github_url = data.get("github_url")
    github_token = data.get("github_token")
    fixes = data.get("fixes", []) # List of { file_path, fixed_code, issue }
    
    if not all([github_url, github_token]) or not fixes:
        raise HTTPException(status_code=400, detail="Missing required parameters or empty fixes array")
        
    owner, repo, pr_number, commit_sha = parse_github_url(github_url)
    
    if not owner or not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL provided.")
    if not pr_number:
        raise HTTPException(status_code=400, detail="Cannot apply batch fix: Please provide a Pull Request URL.")
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch PR details for branch name
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        pr_res = await client.get(pr_url, headers=headers)
        if pr_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch PR details")
            
        branch = pr_res.json().get("head", {}).get("ref")
        if not branch:
            raise HTTPException(status_code=400, detail="Could not find PR branch")
            
        # 2. Get latest commit SHA for the branch exactly
        branch_url = f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{branch}"
        branch_res = await client.get(branch_url, headers=headers)
        if branch_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch branch details")
        latest_commit_sha = branch_res.json().get("object", {}).get("sha")
        
        # 3. Get the base tree SHA
        commit_url = f"https://api.github.com/repos/{owner}/{repo}/git/commits/{latest_commit_sha}"
        commit_res = await client.get(commit_url, headers=headers)
        base_tree_sha = commit_res.json().get("tree", {}).get("sha")
        
        # 4. Create a blob for each fixed file
        tree_elements = []
        for fix in fixes:
            file_url_batch = f"https://api.github.com/repos/{owner}/{repo}/contents/{fix['file_path']}?ref={branch}"
            file_res_batch = await client.get(file_url_batch, headers=headers)
            if file_res_batch.status_code != 200:
                raise HTTPException(status_code=400, detail=f"File {fix['file_path']} not found")
                
            old_content_b64 = file_res_batch.json().get("content", "")
            if not old_content_b64:
                blob_url_fetch = file_res_batch.json().get("git_url")
                if blob_url_fetch:
                    blob_res_fetch = await client.get(blob_url_fetch, headers=headers)
                    old_content_b64 = blob_res_fetch.json().get("content", "")
                    
            old_content = base64.b64decode(old_content_b64).decode("utf-8") if old_content_b64 else ""
            original_code = fix.get("original_code", "")
            fixed_code = fix.get("fixed_code", "")
            
            if original_code and original_code in old_content:
                new_content = old_content.replace(original_code, fixed_code)
            elif original_code.strip() and original_code.strip() in old_content:
                new_content = old_content.replace(original_code.strip(), fixed_code.strip())
            else:
                new_content = old_content.replace(original_code, fixed_code) if original_code else fixed_code

            blob_url = f"https://api.github.com/repos/{owner}/{repo}/git/blobs"
            encoded = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
            blob_payload = {"content": encoded, "encoding": "base64"}
            blob_res = await client.post(blob_url, headers=headers, json=blob_payload)
            if blob_res.status_code != 201:
                raise HTTPException(status_code=400, detail=f"Failed to create blob for {fix['file_path']}: {blob_res.text}")
            
            blob_sha = blob_res.json().get("sha")
            tree_elements.append({
                "path": fix["file_path"],
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha
            })
            
        # 5. Create a new Tree referencing the base tree + new blobs
        tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees"
        tree_payload = {"base_tree": base_tree_sha, "tree": tree_elements}
        tree_res = await client.post(tree_url, headers=headers, json=tree_payload)
        if tree_res.status_code != 201:
            raise HTTPException(status_code=400, detail="Failed to create git tree containing updates")
        new_tree_sha = tree_res.json().get("sha")
        
        # 6. Create the Commit dynamically summarizing the actions
        commit_msg = f"Auto-Fix: Resolved {len(fixes)} issue(s)\n\n"
        for fix in fixes:
             commit_msg += f"- {fix['file_path']}: {fix.get('issue', 'Applied automatic fix')}\n"
             
        commit_url_post = f"https://api.github.com/repos/{owner}/{repo}/git/commits"
        commit_payload = {
            "message": commit_msg,
            "tree": new_tree_sha,
            "parents": [latest_commit_sha]
        }
        create_commit_res = await client.post(commit_url_post, headers=headers, json=commit_payload)
        if create_commit_res.status_code != 201:
            raise HTTPException(status_code=400, detail="Failed to create git commit")
        new_commit_sha = create_commit_res.json().get("sha")
        html_url = create_commit_res.json().get("html_url")
        
        # 7. Update Branch Ref to point to new commit
        update_ref_payload = {"sha": new_commit_sha, "force": False}
        update_ref_res = await client.patch(branch_url, headers=headers, json=update_ref_payload)
        if update_ref_res.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to update branch reference: {update_ref_res.text}")
            
        return {"message": f"Successfully batched {len(fixes)} fixes! 🚀", "commit_url": html_url}

@app.post("/suppress-issue")
async def suppress_issue(request: Request):
    """Adds a specific issue signature to the repo memory, so GitMind won't report it again."""
    data = await request.json()
    github_url = data.get("github_url")
    issue_signature = data.get("issue_signature")
    
    if not github_url or not issue_signature:
        raise HTTPException(status_code=400, detail="Missing github_url or issue_signature")
        
    owner, repo, _, _ = parse_github_url(github_url)
    if not repo:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL")
        
    repo_full_name = f"{owner}/{repo}"
    success = add_suppression(repo_full_name, issue_signature)
    
    if success:
        return {"message": "Issue dismissed successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to save suppression")

@app.get("/history")
async def analysis_history(repo: str = None, limit: int = 20):
    """Returns past analysis history, optionally filtered by repo."""
    return get_history(repo=repo, limit=limit)

@app.get("/history/{analysis_id}")
async def analysis_detail(analysis_id: int):
    """Returns a specific analysis including the full review data."""
    result = get_analysis_by_id(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
