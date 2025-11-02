# Brain MCP - Memory Store MCP Server

A Model Context Protocol (MCP) server that provides intelligent conversation memory storage using DuckDB. This server stores and retrieves the context of your last conversations with support for multiple storage backends including local files, S3, and Google Cloud Storage.

## Features

- 🧠 **Smart Memory Storage**: Automatically maintains context from the last 2 conversations
- 💾 **DuckDB Backend**: Efficient data lake storage using DuckDB
- ☁️ **Multi-Backend Support**: Store data locally or in the cloud (S3, GCS)
- 🔄 **Conversation Management**: Track and retrieve multiple conversations
- 🔍 **Powerful Search**: Search through memories by text, topics, or date range
- 🌙 **Automatic Memory Consolidation**: Nightly worker using LLMs to consolidate short-term memories into long-term insights
- 🤖 **OpenAI-Compatible**: Works with OpenAI API and compatible services (LocalAI, Ollama, etc.)
- 🚀 **Easy Integration**: Standard MCP protocol for seamless integration

## Installation

```bash
npm install
npm run build
```

## Configuration

The server supports different storage backends through the `STORAGE_URL` environment variable:

### File-based Storage (Default)
```bash
export STORAGE_URL="file://brain-memory.duckdb"
```

### S3 Storage
```bash
export STORAGE_URL="s3://my-bucket/brain-memory"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

### Google Cloud Storage
```bash
export STORAGE_URL="gcs://my-bucket/brain-memory"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
```

### Memory Consolidation (Optional but Recommended)

The server includes an automatic nightly worker that consolidates short-term memories into long-term insights using an LLM:

```bash
# Required for consolidation
export OPENAI_API_KEY="your-api-key"

# Optional: Use OpenAI-compatible services
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Or your compatible API
export OPENAI_MODEL="gpt-5-mini"  # Default model

# Optional: Customize consolidation schedule (cron format)
export CONSOLIDATION_SCHEDULE="0 0 * * *"  # Default: midnight daily

# Optional: Disable consolidation
export ENABLE_CONSOLIDATION="false"  # Default: true
```

You can also copy `.env.example` to `.env` and configure your settings there.

## Usage

### Running the Server

```bash
npm start
```

Or for development with auto-rebuild:

```bash
npm run dev
```

### Configuring with Claude Desktop

Add this to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "brain-mcp": {
      "command": "node",
      "args": ["/path/to/brain-mcp/dist/index.js"],
      "env": {
        "STORAGE_URL": "file://brain-memory.duckdb",
        "OPENAI_API_KEY": "your-api-key-here",
        "OPENAI_MODEL": "gpt-5-mini"
      }
    }
  }
}
```

## Available Tools

### 1. `store_memory`

Store a message in the conversation memory.

**Parameters:**
- `role` (required): The role of the message sender - "user", "assistant", or "system"
- `content` (required): The content of the message to store
- `new_conversation` (optional): Whether to start a new conversation (default: false)

**Example:**
```json
{
  "role": "user",
  "content": "What is the weather like today?",
  "new_conversation": false
}
```

### 2. `get_memory`

Retrieve stored conversation memory from the last N conversations.

**Parameters:**
- `conversation_count` (optional): Number of recent conversations to retrieve (default: 2, max: 10)

**Example:**
```json
{
  "conversation_count": 2
}
```

**Response:**
```json
{
  "success": true,
  "conversationCount": 2,
  "currentConversationId": "conv-1234567890",
  "conversations": [
    {
      "conversationId": "conv-1234567890",
      "messageCount": 4,
      "messages": [
        {
          "role": "user",
          "content": "Hello!",
          "timestamp": "2024-01-01T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

### 3. `new_conversation`

Start a new conversation with a fresh conversation ID.

**Parameters:** None

**Example Response:**
```json
{
  "success": true,
  "message": "New conversation started",
  "conversationId": "conv-1234567890"
}
```

### 4. `get_long_term_memory`

Retrieve consolidated long-term memories created by the consolidation worker.

**Parameters:**
- `limit` (optional): Number of memories to retrieve (default: 10, max: 50)

**Example Response:**
```json
{
  "success": true,
  "count": 5,
  "memories": [
    {
      "summary": "Discussion about implementing memory systems with DuckDB...",
      "topics": ["DuckDB", "Memory Systems", "MCP Servers"],
      "keyInsights": [
        "DuckDB provides efficient storage for conversation data",
        "Memory consolidation helps maintain context over time"
      ],
      "consolidatedFrom": "Conversations from 2024-01-15",
      "timestamp": "2024-01-16T00:00:00.000Z"
    }
  ]
}
```

### 5. `consolidate_memory`

Manually trigger memory consolidation (normally runs automatically at night).

**Parameters:** None

**Example Response:**
```json
{
  "success": true,
  "message": "Memory consolidation completed successfully"
}
```

### 6. `search_memory`

Search through both short-term and long-term memories using flexible filters.

**Parameters:**
- `query` (optional): Text to search for in conversation content, summaries, and insights
- `topics` (optional): Array of topics to filter long-term memories
- `start_date` (optional): Start date in ISO format (e.g., "2024-01-01T00:00:00.000Z")
- `end_date` (optional): End date in ISO format (e.g., "2024-12-31T23:59:59.999Z")
- `memory_type` (optional): Type of memory to search - "short-term", "long-term", or "both" (default: "both")
- `limit` (optional): Maximum number of results per memory type (default: 20, max: 100)

**Example Request:**
```json
{
  "query": "DuckDB",
  "topics": ["databases", "storage"],
  "memory_type": "both",
  "limit": 10
}
```

**Example Response:**
```json
{
  "success": true,
  "filters": {
    "query": "DuckDB",
    "topics": ["databases", "storage"],
    "dateRange": "all time",
    "memoryType": "both"
  },
  "shortTermResults": {
    "count": 5,
    "conversations": [
      {
        "conversationId": "conv-1234567890",
        "role": "user",
        "content": "Tell me about DuckDB performance...",
        "timestamp": "2024-01-15T14:30:00.000Z"
      }
    ]
  },
  "longTermResults": {
    "count": 3,
    "memories": [
      {
        "summary": "Discussion about DuckDB as a storage solution...",
        "topics": ["DuckDB", "databases", "storage"],
        "keyInsights": [
          "DuckDB provides excellent analytical query performance",
          "Embedded database with no server required"
        ],
        "consolidatedFrom": "Conversations from 2024-01-14",
        "timestamp": "2024-01-15T00:00:00.000Z"
      }
    ]
  }
}
```


## Architecture

### How Memory Consolidation Works

The Brain MCP implements a two-tier memory system inspired by human memory:

1. **Short-Term Memory (Conversations Table)**
   - Stores recent conversation messages
   - Fast access for context in ongoing conversations
   - Automatically cleared after consolidation

2. **Long-Term Memory (Long-Term Memory Table)**
   - Stores consolidated insights and summaries
   - Created by analyzing short-term memories with an LLM
   - Persists important information indefinitely

3. **Nightly Consolidation Process**
   - Scheduled worker runs at midnight (configurable)
   - Retrieves all conversations from the current day
   - Analyzes them using the configured LLM model
   - Extracts key insights, topics, and creates summaries
   - Stores the consolidation in long-term memory
   - Clears short-term memory to free up space

This approach ensures:
- Recent context is always available
- Important information is preserved long-term
- Storage remains efficient
- Knowledge is organized and searchable

### Storage Backends

The server uses DuckDB as its storage engine with support for:

1. **Local File Storage**: Data is stored in a local DuckDB file
2. **S3 Storage**: Data is persisted to Amazon S3 using DuckDB's httpfs extension
3. **GCS Storage**: Data is persisted to Google Cloud Storage using DuckDB's httpfs extension

### Data Schema

**Short-Term Memory (Conversations):**
```sql
CREATE TABLE conversations (
  id VARCHAR PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  role VARCHAR NOT NULL,
  content TEXT NOT NULL,
  conversation_id VARCHAR NOT NULL
);
```

**Long-Term Memory:**
```sql
CREATE TABLE long_term_memory (
  id VARCHAR PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT NOT NULL,          -- JSON array
  key_insights TEXT NOT NULL,    -- JSON array
  consolidated_from TEXT NOT NULL
);
```

### Memory Management

- The server automatically tracks conversations using unique conversation IDs
- By default, it maintains and can retrieve the last 2 conversations
- You can retrieve up to 10 recent conversations using the `get_memory` tool
- Messages are ordered by timestamp for accurate conversation reconstruction

## Development

### Project Structure

```
brain-mcp/
├── src/
│   ├── index.ts          # Main MCP server implementation
│   ├── storage.ts        # Storage manager with DuckDB integration
│   └── consolidation.ts  # Memory consolidation worker
├── dist/                 # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Building

```bash
npm run build
```

### Type Checking

The project uses TypeScript with strict type checking enabled.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| **Storage Configuration** | | |
| `STORAGE_URL` | Storage backend URL | `file://brain-memory.duckdb` |
| `AWS_ACCESS_KEY_ID` | AWS access key (for S3) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (for S3) | - |
| `AWS_REGION` | AWS region (for S3) | `us-east-1` |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCS credentials path | - |
| **Consolidation Configuration** | | |
| `OPENAI_API_KEY` | OpenAI API key (required for consolidation) | - |
| `OPENAI_BASE_URL` | OpenAI-compatible API endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model to use for consolidation | `gpt-5-mini` |
| `CONSOLIDATION_SCHEDULE` | Cron schedule for consolidation | `0 0 * * *` (midnight) |
| `ENABLE_CONSOLIDATION` | Enable/disable auto-consolidation | `true` |

## Use Cases

### Basic Usage
Store and retrieve recent conversations for immediate context.

### Long-Term Knowledge Base
Automatically build a searchable knowledge base of important insights and information from all your conversations.

### Multi-User Systems
Use different storage backends for different users or contexts.

### Offline-First with Cloud Sync
Use local storage for fast access, with periodic sync to cloud storage for backup and sharing.

### Custom Consolidation Schedules
Run consolidation multiple times per day, weekly, or on-demand based on your needs.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
