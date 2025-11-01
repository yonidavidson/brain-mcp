# Pull Request: Brain MCP Memory Store Server

## Title
Brain MCP: Memory Store Server with Automatic LLM-Powered Consolidation

## Description

### Summary

This PR implements a complete MCP (Model Context Protocol) server for intelligent conversation memory storage with automatic consolidation using LLMs. The system implements a two-tier memory architecture inspired by human memory: short-term memory for immediate context and long-term memory for important insights.

### 🎯 Key Features

#### Core Functionality
- ✅ **MCP Server** with 5 tools for memory management
- ✅ **DuckDB Storage** for efficient data lake storage
- ✅ **Multi-Backend Support** (local files, S3, GCS)
- ✅ **Conversation Tracking** with unique IDs and timestamps
- ✅ **TypeScript** implementation with strict typing

#### 🌙 Automatic Memory Consolidation (NEW)
- ✅ **Nightly Worker** that consolidates short-term to long-term memory
- ✅ **LLM Integration** using OpenAI-compatible APIs
- ✅ **Smart Analysis** extracts topics, insights, and summaries
- ✅ **Context-Aware** considers existing memories to avoid duplication
- ✅ **Configurable Scheduling** via cron expressions
- ✅ **Automatic Cleanup** clears short-term memory after consolidation

### 🛠️ MCP Tools

1. **store_memory** - Store conversation messages with role and content
2. **get_memory** - Retrieve last N conversations (default: 2)
3. **new_conversation** - Start a new conversation
4. **get_long_term_memory** - Retrieve consolidated insights
5. **consolidate_memory** - Manually trigger consolidation

### 🏗️ Architecture

#### Two-Tier Memory System

**Short-Term Memory (conversations table)**
- Stores recent conversation messages
- Fast access for ongoing context
- Automatically cleared after consolidation

**Long-Term Memory (long_term_memory table)**
- Stores consolidated insights and summaries
- Created by LLM analysis of short-term memories
- Persists important information indefinitely

#### Consolidation Process
1. Runs on configurable schedule (default: midnight)
2. Retrieves all conversations from the current day
3. Analyzes using configured LLM (default: gpt-4o-mini)
4. Extracts key insights, topics, and creates summaries
5. Stores consolidation in long-term memory
6. Clears short-term memory

### ⚙️ Configuration

#### Storage Backend
```bash
STORAGE_URL=file://brain-memory.duckdb    # Local (default)
STORAGE_URL=s3://bucket/path              # Amazon S3
STORAGE_URL=gcs://bucket/path             # Google Cloud Storage
```

#### Memory Consolidation
```bash
OPENAI_API_KEY=your-api-key               # Required
OPENAI_MODEL=gpt-4o-mini                  # Default model
OPENAI_BASE_URL=https://api.openai.com/v1 # OpenAI-compatible APIs
CONSOLIDATION_SCHEDULE=0 0 * * *          # Cron format
ENABLE_CONSOLIDATION=true                 # Toggle feature
```

### 📦 Dependencies

- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **duckdb** - Efficient embedded database
- **node-cron** - Task scheduling
- **openai** - LLM integration

### 📁 Project Structure

```
brain-mcp/
├── src/
│   ├── index.ts          # Main MCP server
│   ├── storage.ts        # DuckDB storage manager
│   └── consolidation.ts  # Memory consolidation worker
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 🚀 Usage

#### Install and Build
```bash
npm install
npm run build
```

#### Run Server
```bash
npm start
```

#### Configure with Claude Desktop
```json
{
  "mcpServers": {
    "brain-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/brain-mcp/dist/index.js"],
      "env": {
        "STORAGE_URL": "file://brain-memory.duckdb",
        "OPENAI_API_KEY": "your-api-key",
        "OPENAI_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

### 🎯 Use Cases

- **Context Retention** - Maintain conversation context across sessions
- **Knowledge Base** - Automatically build searchable knowledge from conversations
- **Multi-Backend** - Use local storage with cloud sync for backup
- **Custom Schedules** - Run consolidation daily, weekly, or on-demand
- **OpenAI Alternatives** - Works with LocalAI, Ollama, and other compatible services

### 📝 Commits

- `1d8c1fa` - Implement MCP server with DuckDB-based memory store
- `1296967` - Add automatic memory consolidation with LLM-powered worker

### 🔍 Changes Summary

**New Files:**
- `src/consolidation.ts` (206 lines)
- `.env.example`
- `.gitignore`
- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/storage.ts`

**Modified Files:**
- `README.md` - Comprehensive documentation with consolidation features

**Total Changes:** ~1,300+ lines added

---

This implementation provides a robust, production-ready memory system for MCP servers with intelligent consolidation powered by LLMs.
