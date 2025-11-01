# Pull Request: Brain MCP Memory Store Server

## Title
Brain MCP: Memory Store with Search & Consolidation

## Description

### Summary

This PR implements a complete MCP (Model Context Protocol) server for intelligent conversation memory storage with automatic LLM-powered consolidation and powerful search capabilities.

### 🎯 Key Features

#### Core Memory System
- ✅ **MCP Server** with 6 tools for comprehensive memory management
- ✅ **DuckDB Storage** for efficient data lake operations
- ✅ **Multi-Backend Support** (local files, S3, GCS)
- ✅ **Two-Tier Architecture** (short-term + long-term memory)
- ✅ **TypeScript** implementation with strict typing

#### 🌙 Automatic Memory Consolidation
- ✅ **Nightly Worker** consolidates short-term to long-term memory
- ✅ **LLM Integration** using OpenAI-compatible APIs
- ✅ **Smart Analysis** extracts topics, insights, and summaries
- ✅ **Context-Aware** considers existing memories to avoid duplication
- ✅ **Configurable Scheduling** via cron expressions
- ✅ **Automatic Cleanup** clears short-term memory after consolidation

#### 🔍 Powerful Search (NEW)
- ✅ **Search Both Memory Types** - Query short-term and long-term memories
- ✅ **Text Query** - Search across content, summaries, and insights
- ✅ **Filter by Topics** - Find memories by specific topics
- ✅ **Filter by Date Range** - Time-based memory retrieval
- ✅ **Choose Memory Type** - Search short-term, long-term, or both
- ✅ **Configurable Limits** - Control result count per query

### 🛠️ MCP Tools

1. **store_memory** - Store conversation messages with role and content
2. **get_memory** - Retrieve last N conversations (default: 2)
3. **new_conversation** - Start a new conversation
4. **get_long_term_memory** - Retrieve consolidated insights
5. **consolidate_memory** - Manually trigger consolidation
6. **search_memory** - Search memories by text, topics, or date range

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

#### Search Implementation
- SQL-based filtering with DuckDB
- Text search using LIKE queries for fuzzy matching
- Topic matching in JSON arrays
- Timestamp-based date filtering
- Separate results for each memory type with counts

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
CONSOLIDATION_SCHEDULE=0 0 * * *          # Cron format (midnight)
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
│   ├── storage.ts        # DuckDB storage manager with search
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
- **Topic Discovery** - Find all conversations about specific topics
- **Time-based Queries** - Retrieve memories from specific time periods
- **Smart Insights** - LLM-powered extraction of key information
- **Multi-Backend** - Use local storage with cloud sync for backup
- **Custom Schedules** - Run consolidation daily, weekly, or on-demand
- **OpenAI Alternatives** - Works with LocalAI, Ollama, and other compatible services

### 📝 Commits

- `1d8c1fa` - Implement MCP server with DuckDB-based memory store
- `1296967` - Add automatic memory consolidation with LLM-powered worker
- `b4b2b14` - Add powerful search functionality to memory system

### 🔍 Changes Summary

**New Files:**
- `src/consolidation.ts` - Memory consolidation worker
- `src/index.ts` - Main MCP server with all tools
- `src/storage.ts` - Storage manager with search capabilities
- `.env.example` - Configuration template
- `.gitignore` - Git ignore rules
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

**Modified Files:**
- `README.md` - Comprehensive documentation with all features

**Total Changes:** ~1,600+ lines added across 7 files

### 🧪 Testing the Features

```bash
# 1. Store some conversations
# Use store_memory tool

# 2. Search for specific topics
# Use search_memory with query="topic"

# 3. Manually trigger consolidation
# Use consolidate_memory tool

# 4. Check long-term memories
# Use get_long_term_memory tool

# 5. Search by date range
# Use search_memory with start_date and end_date

# 6. Filter by topics
# Use search_memory with topics array
```

---

This implementation provides a robust, production-ready memory system for MCP servers with intelligent consolidation and powerful search capabilities, all powered by LLMs and DuckDB.
