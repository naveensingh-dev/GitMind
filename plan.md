# GitMind Evolution Plan: Roadmap to Version 2.0

This document outlines the strategic roadmap for evolving GitMind from a standalone code review viewer into a fully integrated, context-aware, and actionable AI Engineering Agent.

---

## Phase 1: Direct GitHub Integration (Actionable Feedback)
**Goal:** Move beyond the GitMind UI and place findings exactly where developers work—inside the PR.

### 1.1 Line-Level PR Comments
*   **Mechanism:** Map the `line` property in `ReviewItem` back to the specific diff hunk and file path.
*   **Action:** Use the GitHub REST API (`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments`) to post specific issues.
*   **UI:** Add a "Push to GitHub" button next to each review item in the GitMind results area.

### 1.2 GitHub Checks Integration
*   **Mechanism:** Create a "GitMind Check Run" using the Checks API.
*   **Behavior:** Set the status to `failure` if "High" severity issues are found, preventing merging until addressed.
*   **Benefit:** Provides a formal "Gatekeeper" status in the GitHub PR interface.

### 1.3 OAuth2 Authentication
*   **Implementation:** Securely store GitHub Personal Access Tokens (PAT) or implement an OAuth2 flow to allow GitMind to act on behalf of the user.

---

## Phase 2: Deep Repository Context (RAG & Semantic Awareness)
**Goal:** Enable the agent to understand dependencies and codebase patterns beyond the provided diff.

### 2.1 Contextual File Fetching
*   **Logic:** When the agent sees a change in `userService.ts`, it should automatically fetch `userModel.ts` and `authMiddleware.ts` to verify type safety and security logic.
*   **Implementation:** Add a "Context Retriever" node in the LangGraph that identifies imports in the diff and fetches their source.

### 2.2 Local Repository Indexing (RAG)
*   **Technology:** Use ChromaDB or FAISS to index the entire repository.
*   **Vector Search:** Allow the agent to query the codebase: *"Is there an existing utility for input sanitization used elsewhere?"*
*   **Benefit:** Eliminates "Duplicate Logic" review items and ensures consistency with existing architectural patterns.

---

## Phase 3: Automated Patch Generation (One-Click Fixes)
**Goal:** Transform "Suggestions" into "Solutions."

### 3.1 GitHub "Suggested Changes" Format
*   **Logic:** Instead of just text, have the LLM output the exact code block change in a format GitHub recognizes.
*   **Execution:** Post the fix as a "Multi-line suggestion" on the PR, allowing the developer to click "Commit Suggestion" directly in GitHub.

### 3.2 UI "Apply Fix" Preview
*   **Feature:** A side-by-side view in the GitMind UI showing the "Current Code" vs. "AI Proposed Code."
*   **One-Click Commit:** If integrated with a local clone, GitMind can apply the patch and create a new commit automatically.

---

## Phase 4: Project-Specific Standards (.gitmind.json)
**Goal:** Allow teams to encode their specific engineering culture into the agent.

### 4.1 Custom Rule Engine
*   **Configuration:** Support a `.gitmind.json` file in the repository root.
    ```json
    {
      "rules": ["Prefer functional components over classes", "Always use 't()' for localization strings"],
      "ignore_paths": ["**/tests/**", "**/mocks/**"]
    }
    ```
*   **Prompt Injection:** The Agent's system prompt will dynamically include these rules during the `initial_review` node.

---

## Phase 5: Persistence & Quality Dashboard
**Goal:** Track code quality trends and review history.

### 5.1 SQLite Persistence Layer
*   **Data Store:** Save every `thread_id`, diff, and resulting `ReviewReport`.
*   **History View:** A new "History" tab in the frontend to revisit past reviews and human refinements.

### 5.2 Analytics Dashboard
*   **Metrics:** 
    *   Most frequent issue categories (e.g., "Performance is our biggest bottleneck").
    *   AI Confidence vs. Human Refinement rate.
    *   Time saved per review cycle.

---

## Implementation Priority
1.  **Phase 4 (Rules):** Highest impact for immediate utility.
2.  **Phase 1 (GitHub Write):** Essential for workflow integration.
3.  **Phase 3 (Patches):** The "Wow" factor for developer productivity.
4.  **Phase 2 (RAG):** Required for complex, large-scale projects.
5.  **Phase 5 (Persistence):** Enterprise-grade maturity.
