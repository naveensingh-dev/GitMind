import json
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from agent import app_graph, fetch_github_diff_text
from schemas import AgentState

app = FastAPI(title="GitMind API")

# Enable CORS for Angular (Consider restricting in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/fetch-diff")
async def fetch_github_diff(url: str):
    """Fetches raw diff from a GitHub PR or Commit URL."""
    if "github.com" not in url:
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported")

    diff = await fetch_github_diff_text(url)
    if diff:
        return {"diff": diff}
    
    raise HTTPException(status_code=404, detail="Failed to fetch diff. Ensure the URL is public and valid.")

@app.post("/analyze")
async def analyze_pr(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Initialize state using AgentState model for validation
    try:
        initial_state = AgentState(
            diff=data.get("diff", ""),
            github_url=data.get("github_url"),
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
        try:
            # Stream events from LangGraph
            # We convert the Pydantic model to a dict for LangGraph
            async for event in app_graph.astream(initial_state.model_dump()):
                if not event:
                    continue
                    
                node_name = list(event.keys())[0]
                state_update = event[node_name]
                
                # Ensure values are serializable
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
