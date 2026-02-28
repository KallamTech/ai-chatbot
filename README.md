# Nexus AI Chatbot

A production-grade AI chatbot platform, forked from [Vercel's Chat SDK](https://github.com/vercel/ai-chatbot) and extended with multi-model support, document management, RAG search, and custom AI agents.

**Live:** [nexus.taimiraguacil.com](https://nexus.taimiraguacil.com)

## What's Different from the Original

- **30+ LLM providers** — Claude, GPT, Grok, Gemini, DeepSeek, Llama, Mistral, Perplexity, and more, switchable from the UI
- **RAG & Document Pools** — Upload documents, index them with Upstash Vector, and query them contextually in conversations
- **Custom AI Agents** — Build agents with unique personas and connect them to specific data pools
- **Artifact System** — Create and edit code, documents, spreadsheets, and images directly in chat
- **Python Sandbox** — Execute Python code in-browser via Pyodide
- **Interface Improvements** — Patched Vercel's original codebase to fix error recovery in chat streams, improve source attribution, and enhance the overall UI
- **Security Patch** — Upgraded Next.js to address the React Flight RCE vulnerability (CVE-2024-62819)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, React 18, TypeScript |
| AI | Vercel AI SDK 5.0, 30+ model providers |
| Database | Neon Serverless PostgreSQL, Drizzle ORM |
| Vector Search | Upstash Vector |
| Cache/Sessions | Upstash Redis |
| Auth | Auth.js (next-auth) |
| File Storage | Vercel Blob |
| UI | shadcn/ui, Radix UI, Tailwind CSS |
| Editors | CodeMirror 6, ProseMirror |
| Testing | Playwright |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL database ([Neon](https://neon.tech) recommended)
- API keys for your chosen LLM providers

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/KallamTech/ai-chatbot.git
   cd ai-chatbot
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```

4. Push the database schema:
   ```bash
   pnpm db:push
   ```

5. Start the dev server:
   ```bash
   pnpm dev
   ```

The app will be running at [localhost:3000](http://localhost:3000).

## License

This project is based on [Vercel's Chat SDK](https://github.com/vercel/ai-chatbot), licensed under the Apache License 2.0.
