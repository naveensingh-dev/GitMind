import asyncio
import json
from main import app
import agent
from schemas import ReviewReport, ReviewItem

async def mock_invoke_llm(structured_class, state, messages, **kwargs):
    if structured_class == ReviewReport:
        return ReviewReport(security=[], performance=[], style=[], summary="test", approval_status="approved", confidence_score=100), "mock-model"
    return None, "mock"

agent.invoke_llm = mock_invoke_llm

# We can bypass other nodes to make it simple
# Just hit the API using TestClient

def test_run():
    from fastapi.testclient import TestClient
    client = TestClient(app)
    payload = {
        "diff": "diff",
        "github_url": "https://github.com/mock/mock",
        "security_scan": False,
        "perf_analysis": False,
        "style_review": False,
        "self_critique": False,
        "selected_provider": "gemini",
        "selected_model": "mock-model",
        "api_key": "mock"
    }
    with client.stream("POST", "/analyze", json=payload) as response:
        print("STATUS", response.status_code)
        for line in response.iter_lines():
            print(line)

test_run()
