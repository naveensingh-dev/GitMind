import pytest
import asyncio
from unittest.mock import patch, MagicMock
from agent import app_graph
from schemas import ReviewReport, CritiqueResult

@pytest.mark.asyncio
async def test_graph_flow_success():
    """Tests a full successful pass through the graph without refinement."""
    
    mock_review = ReviewReport(
        security=[],
        performance=[],
        style=[],
        summary="Looks good.",
        approval_status="approved",
        confidence_score=95
    )
    
    mock_critique = CritiqueResult(
        accurate=True,
        constructive=True,
        score=90,
        feedback=None
    )

    # We patch invoke_llm to return our mocks
    # Since it's called twice (initial_review, critique)
    with patch("agent.invoke_llm") as mock_invoke:
        mock_invoke.side_effect = [
            (mock_review, "mock-model"),
            (mock_critique, "mock-model")
        ]
        
        inputs = {
            "diff": "some code diff",
            "selected_provider": "gemini",
            "selected_model": "gemini-1.5-flash"
        }
        
        # Run the graph
        final_state = await app_graph.ainvoke(inputs)
        
        assert final_state["status"] == "critique_complete"
        assert final_state["reviews"].summary == "Looks good."
        assert final_state["critique"].score == 90
        assert mock_invoke.call_count == 2

@pytest.mark.asyncio
async def test_graph_flow_with_refinement():
    """Tests the graph's ability to loop back and refine when critique score is low."""
    
    mock_review_bad = ReviewReport(
        security=[], performance=[], style=[],
        summary="Too brief.",
        approval_status="needs_changes",
        confidence_score=40
    )
    
    mock_critique_fail = CritiqueResult(
        accurate=False,
        constructive=True,
        score=30,
        feedback="Please add more detail."
    )
    
    mock_review_good = ReviewReport(
        security=[], performance=[], style=[],
        summary="Detailed review.",
        approval_status="approved",
        confidence_score=90
    )
    
    mock_critique_pass = CritiqueResult(
        accurate=True,
        constructive=True,
        score=95,
        feedback="Much better."
    )

    with patch("agent.invoke_llm") as mock_invoke:
        # Call order: 
        # 1. initial_review -> bad
        # 2. critique -> fail
        # 3. refine -> good
        # 4. critique Pass
        mock_invoke.side_effect = [
            (mock_review_bad, "mock-model"),
            (mock_critique_fail, "mock-model"),
            (mock_review_good, "mock-model"),
            (mock_critique_pass, "mock-model")
        ]
        
        inputs = {
            "diff": "some code diff",
            "self_critique": True
        }
        
        final_state = await app_graph.ainvoke(inputs)
        
        assert final_state["refinement_count"] == 1
        assert final_state["reviews"].summary == "Detailed review."
        assert mock_invoke.call_count == 4
