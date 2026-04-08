import json
import asyncio
import httpx
import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from agent import app_graph
from schemas import AgentState

app = FastAPI()

# Enable CORS for Angular
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/fetch-diff")
async def fetch_github_diff(url: str):
    """Fetches raw diff from a GitHub PR or Commit URL using the .diff extension."""
    if "github.com" not in url:
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported")

    # Clean the URL and append .diff
    clean_url = url.split("?")[0].rstrip("/")
    if not clean_url.endswith(".diff"):
        diff_url = clean_url + ".diff"
    else:
        diff_url = clean_url

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(diff_url, follow_redirects=True)
            if response.status_code == 200:
                return {"diff": response.text}
            else:
                # Fallback to .patch if .diff fails
                patch_url = clean_url + ".patch"
                response = await client.get(patch_url, follow_redirects=True)
                if response.status_code == 200:
                    return {"diff": response.text}
                
                raise HTTPException(status_code=response.status_code, detail=f"Failed to fetch diff: {response.status_code}")
    except httpx.ReadTimeout:
        raise HTTPException(status_code=504, detail="Request to GitHub timed out.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/analyze")
async def analyze_pr(request: Request):
    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Initialize state
    initial_state = {
        "diff": data.get("diff", ""),
        "github_url": data.get("github_url"),
        "security_scan": data.get("security_scan", True),
        "perf_analysis": data.get("perf_analysis", True),
        "style_review": data.get("style_review", True),
        "self_critique": data.get("self_critique", True),
        "refinement_count": 0,
        "status": "started"
    }

    async def event_generator():
        try:
            # Stream events from LangGraph
            async for event in app_graph.astream(initial_state):
                # Extract node name and updated state
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                # Prepare data for frontend
                payload = {
                    "node": node_name,
                    "status": state_update.get("status"),
                    "refinement_count": state_update.get("refinement_count", 0),
                    "reviews": state_update.get("reviews").model_dump() if state_update.get("reviews") else None,
                    "critique": state_update.get("critique").model_dump() if state_update.get("critique") else None
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.1)
        except Exception as e:
            error_payload = {
                "node": "error",
                "status": "failed",
                "message": str(e)
            }
            yield f"data: {json.dumps(error_payload)}\n\n"
            print(f"Error in stream: {e}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
