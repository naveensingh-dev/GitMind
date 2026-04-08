# 🧠 GitMind: Self-Correcting Code Review Agent

[![Powered by LangGraph](https://img.shields.io/badge/Powered%20By-LangGraph-blue?style=for-the-badge&logo=python)](https://github.com/langchain-ai/langgraph)
[![Frontend-Angular](https://img.shields.io/badge/Frontend-Angular%2021-DD0031?style=for-the-badge&logo=angular)](https://angular.io/)
[![Backend-FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

**GitMind** is an advanced AI-powered code review agent designed to automate and elevate the pull request review process. Built on a self-correcting state machine, GitMind doesn't just find bugs—it critiques its own findings to ensure accuracy, tone, and actionability before they ever reach a human developer.

---

## ✨ Key Features

- **🔄 Self-Correcting State Machine:** Utilizes LangGraph to implement a Review-Critique-Refinement loop that ensures high-quality feedback.
- **🔐 Multi-Category Analysis:** Specialized scans for **Security** (SQLi, Secrets, XSS), **Performance** (O(n²) loops, resource leaks), and **Style** (naming, best practices).
- **🚀 Real-time Progress Streaming:** Built with FastAPI Server-Sent Events (SSE) to show the agent's "thoughts" and progress live in the UI.
- **🌐 GitHub Integration:** Direct fetching of PR diffs and commit changes via the GitHub API (bypassing CORS restrictions).
- **🤖 Multi-LLM Support:** Seamlessly switch between **Anthropic Claude 3.5**, **OpenAI GPT-4o**, and **Google Gemini 2.5 Flash**.

---

## 🏗 Architecture

GitMind operates as a directed cyclic graph (DAG) using **LangGraph**:

1.  **Input Parse Node:** Fetches raw diffs from GitHub URLs or processes pasted text.
2.  **Initial Review Node:** Generates a structured analysis across Security, Performance, and Style.
3.  **Self-Critique Node:** A specialized AI persona evaluates the review for accuracy and constructive tone.
4.  **Refinement Loop:** If the critique score is below the threshold, the agent re-runs the review with specific instructions to fix its own errors.
5.  **Output Node:** Compiles the final findings into a beautiful Markdown report and JSON payload.

---

## 🛠 Tech Stack

### Backend
- **Python 3.10+**
- **LangGraph & LangChain:** Agent orchestration.
- **FastAPI:** High-performance async API.
- **Pydantic V2:** Strict data validation and structured output.
- **HTTPX:** Async HTTP client for GitHub integration.

### Frontend
- **Angular 21:** Modern, zoneless architecture.
- **TypeScript:** Type-safe frontend logic.
- **Vanilla CSS:** Highly polished, custom-designed UI with glassmorphism and grid textures.

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+
- Node.js & npm
- An API Key from Anthropic, OpenAI, or Google AI Studio.

### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo "GOOGLE_API_KEY=your_key_here" > .env

# Start the server
python main.py
```

### 3. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Angular app
ng serve
```
Visit `http://localhost:4200` to start your first review!

---

## 📊 Roadmap

- [ ] **GitHub Webhook Integration:** Auto-trigger reviews on PR creation.
- [ ] **Custom Style Guides:** Upload your own `lint` rules or company style guides.
- [ ] **Multi-File Context:** Analyze full repository context for more complex bug detection.
- [ ] **IDE Plugin:** JetBrains and VS Code extensions for in-editor reviews.

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by the GitMind Team
</p>
