# Brain MCP - Memory Store MCP Server

A Model Context Protocol (MCP) server that provides intelligent conversation memory storage using DuckDB. This server stores and retrieves the context of your last conversations with support for multiple storage backends including local files, S3, and Google Cloud Storage.

## Features

- 🧠 **Smart Memory Storage**: Automatically maintains context from the last 2 conversations
- 💾 **DuckDB Backend**: Efficient data lake storage using DuckDB
- ☁️ **Multi-Backend Support**: Store data locally or in the cloud (S3, GCS)
- 🔄 **Conversation Management**: Track and retrieve multiple conversations
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
        "STORAGE_URL": "file://brain-memory.duckdb"
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

## Architecture

### Storage Backends

The server uses DuckDB as its storage engine with support for:

1. **Local File Storage**: Data is stored in a local DuckDB file
2. **S3 Storage**: Data is persisted to Amazon S3 using DuckDB's httpfs extension
3. **GCS Storage**: Data is persisted to Google Cloud Storage using DuckDB's httpfs extension

### Data Schema

Conversations are stored in a table with the following schema:

```sql
CREATE TABLE conversations (
  id VARCHAR PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  role VARCHAR NOT NULL,
  content TEXT NOT NULL,
  conversation_id VARCHAR NOT NULL
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
│   └── storage.ts        # Storage manager with DuckDB integration
├── dist/                 # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
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
| `STORAGE_URL` | Storage backend URL | `file://brain-memory.duckdb` |
| `AWS_ACCESS_KEY_ID` | AWS access key (for S3) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (for S3) | - |
| `AWS_REGION` | AWS region (for S3) | `us-east-1` |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCS credentials path | - |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
