# GitMind LLM Token Optimization Strategy

A critical review of the GitMind backend orchestration (`agent.py`, `diff_parser.py`, and `prompts.py`) reveals severe token bloat stemming from the LangGraph multi-agent architecture. While the system is highly capable, the current "scatter-gather" pipeline methodology causes an astronomical multiplication of token consumption.

To significantly reduce API costs and improve response latency, the following architectural and prompting optimizations should be implemented.

---

## 1. The Multi-Pass Token Explosion (Agent Workflow)

### Current Bottleneck
In `agent.py`, the `app_graph` state machine triggers a massive wave of parallel LLM calls for every single pull request analysis:
1. **Parallel Personas:** The `multi_review_node` launches up to 3 independent LLM calls for Security, Performance, and Style. Each call is fed the **entire** raw diff string.
2. **Arbitration Phase:** The `arbitrate_node` takes the JSON outputs of all three personas, PLUS the **entire** raw diff again, and passes it to an Arbitrator LLM to deduplicate.
3. **Enhancement Phase:** The `enhance_node` concurrently runs `auto_fix`, `test_gen`, and `arch_review`. Again, they each receive the **entire** raw diff.
4. **Critique Phase:** The `critique_node` runs another LLM call with the **entire** raw diff and the final review JSON.

**The Math:** If a user submits a PR with a 10,000 token diff, the agent currently parses that diff roughly **8 separate times**. This results in ~80,000 input tokens consumed per PR, which is incredibly wasteful.

### Solutions
* **Single-Pass Core Review:** Modern LLMs (like Gemini 3.1 Pro and Claude 3.7) are highly capable of multi-tasking. Combine the Security, Performance, and Style personas into a single `SystemPrompts` instruction and use Structured JSON Output (`Pydantic`) to force the LLM to categorize the outputs simultaneously. This allows you to completely eliminate the `arbitrate_node`.
* **Lazy Enhancement (On-Demand):** Do not eagerly execute the `enhance_node`. Auto-fixes, Unit Tests, and Architectural diagrams should only generate when a user explicitly clicks a button in the Angular UI (e.g., "Generate Fix for this File"). This alone saves 3 heavy LLM calls per run.

## 2. Diff Parsing & Payload Bloat

### Current Bottleneck
In `diff_parser.py`, the `build_review_context()` function assembles up to 120,000 characters of raw diff text. While it correctly assigns lower priority to config/lock files (`PRIORITY_PATTERNS`), it still prioritizes them into the LLM payload if they fit within the 120kb limit.

### Solutions
* **Hard File Skips:** Package lock files (`package-lock.json`, `pnpm-lock.yaml`), binary files, and generated build artifacts (`dist/`, `build/`) provide zero semantic value to AI Code Reviewers. They should be strictly filtered out during `parse_unified_diff` instead of just deprioritized.
* **Snippets over Full Diffs:** During the auto-fix phase, the LLM receives the full PR diff. It should only receive the specific `DiffChunk` associated with the file it is attempting to fix.

## 3. Tiered Model Selection

### Current Bottleneck
The user selects a single provider/model (e.g., `gemini-3.1-pro-preview`) on the UI, which is then bound globally to every single node in the LangGraph matrix via the `invoke_llm` wrapper.

### Solutions
* **Routing by Task Complexity:** 
  * The complex architectural reviews and deep security analysis require reasoning-heavy models (e.g., `gemini-3.1-pro` or `o1`).
  * Trivial tasks like `critique_node` scoring, text summarization, or basic syntax styling checks can be routed to highly cost-efficient models (e.g., `gemini-3.1-flash-lite`, `gpt-4o-mini`).
* Decoupling the "Review Loader" model from the "Enhancement" model in the UI settings would immediately slash costs while preserving accuracy.

## 4. Prompt Optimization

### Current Bottleneck
In `prompts.py`, `ARBITRATOR_PROMPT` demands the LLM cross-check JSON arrays and manually deduplicate items.

### Solutions
* LLMs are expensive data processors. Deduplication (e.g., finding identical lines and files) should be written in standard Python algorithm logic (`set` operations or Dictionary hashing), completely bypassing the LLM step. 
