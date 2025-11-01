#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { StorageManager } from './storage.js';

// Parse storage configuration from environment or use default
const STORAGE_URL = process.env.STORAGE_URL || 'file://brain-memory.duckdb';

// Current conversation ID
let currentConversationId = `conv-${Date.now()}`;

// Initialize storage
const storage = new StorageManager({ url: STORAGE_URL });

// Define the tools
const TOOLS: Tool[] = [
  {
    name: 'store_memory',
    description: 'Store a message in the conversation memory. This tool stores the context of conversations in a DuckDB-based data lake. The system automatically maintains the last 2 conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'The role of the message sender (e.g., "user", "assistant", "system")',
          enum: ['user', 'assistant', 'system']
        },
        content: {
          type: 'string',
          description: 'The content of the message to store'
        },
        new_conversation: {
          type: 'boolean',
          description: 'Whether to start a new conversation (default: false)',
          default: false
        }
      },
      required: ['role', 'content']
    }
  },
  {
    name: 'get_memory',
    description: 'Retrieve the stored conversation memory. Returns messages from the last 2 conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_count: {
          type: 'number',
          description: 'Number of recent conversations to retrieve (default: 2, max: 10)',
          default: 2,
          minimum: 1,
          maximum: 10
        }
      }
    }
  },
  {
    name: 'new_conversation',
    description: 'Start a new conversation. This creates a new conversation ID for subsequent messages.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Create server instance
const server = new Server(
  {
    name: 'brain-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'store_memory': {
        const { role, content, new_conversation = false } = args as {
          role: string;
          content: string;
          new_conversation?: boolean;
        };

        if (new_conversation) {
          currentConversationId = `conv-${Date.now()}`;
        }

        await storage.storeMessage(currentConversationId, role, content);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Message stored successfully',
                conversationId: currentConversationId,
                timestamp: Date.now()
              }, null, 2)
            }
          ]
        };
      }

      case 'get_memory': {
        const { conversation_count = 2 } = args as {
          conversation_count?: number;
        };

        const count = Math.min(Math.max(conversation_count, 1), 10);
        const messages = await storage.getLastNConversations(count);

        // Group messages by conversation
        const conversationMap = new Map<string, typeof messages>();
        messages.forEach(msg => {
          if (!conversationMap.has(msg.conversationId)) {
            conversationMap.set(msg.conversationId, []);
          }
          conversationMap.get(msg.conversationId)!.push(msg);
        });

        const conversations = Array.from(conversationMap.entries()).map(([id, msgs]) => ({
          conversationId: id,
          messageCount: msgs.length,
          messages: msgs.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp).toISOString()
          }))
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                conversationCount: conversations.length,
                currentConversationId,
                conversations
              }, null, 2)
            }
          ]
        };
      }

      case 'new_conversation': {
        currentConversationId = `conv-${Date.now()}`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'New conversation started',
                conversationId: currentConversationId
              }, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: errorMessage
          }, null, 2)
        }
      ],
      isError: true,
    };
  }
});

// Main function to start the server
async function main() {
  console.error('Initializing Brain MCP Server...');
  console.error(`Storage URL: ${STORAGE_URL}`);

  try {
    await storage.initialize();
    console.error('Storage initialized successfully');
  } catch (error) {
    console.error('Failed to initialize storage:', error);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Brain MCP Server running on stdio');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await storage.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down...');
    await storage.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
