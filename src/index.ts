#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import cron from 'node-cron';
import { StorageManager } from './storage.js';
import { MemoryConsolidator } from './consolidation.js';

// Parse storage configuration from environment or use default
const STORAGE_URL = process.env.STORAGE_URL || 'file://brain-memory.duckdb';

// Consolidation configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const CONSOLIDATION_SCHEDULE = process.env.CONSOLIDATION_SCHEDULE || '0 0 * * *'; // Default: midnight every day
const ENABLE_CONSOLIDATION = process.env.ENABLE_CONSOLIDATION !== 'false'; // Default: enabled

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
  },
  {
    name: 'get_long_term_memory',
    description: 'Retrieve consolidated long-term memories. These are summaries created by analyzing and consolidating past conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of long-term memories to retrieve (default: 10, max: 50)',
          default: 10,
          minimum: 1,
          maximum: 50
        }
      }
    }
  },
  {
    name: 'consolidate_memory',
    description: 'Manually trigger memory consolidation. This will consolidate today\'s short-term memories into long-term memory and clear the short-term storage.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'search_memory',
    description: 'Search through both short-term and long-term memories using filters. Search by text query, topics, or date range.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in conversation content, summaries, and insights'
        },
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter long-term memories by specific topics'
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO format (e.g., 2024-01-01T00:00:00.000Z) or timestamp'
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format (e.g., 2024-12-31T23:59:59.999Z) or timestamp'
        },
        memory_type: {
          type: 'string',
          enum: ['short-term', 'long-term', 'both'],
          description: 'Type of memory to search (default: both)',
          default: 'both'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return per memory type (default: 20)',
          default: 20,
          minimum: 1,
          maximum: 100
        }
      }
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

      case 'get_long_term_memory': {
        const { limit = 10 } = args as {
          limit?: number;
        };

        const count = Math.min(Math.max(limit, 1), 50);
        const memories = await storage.getLongTermMemories(count);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: memories.length,
                memories: memories.map(m => ({
                  summary: m.summary,
                  topics: m.topics,
                  keyInsights: m.keyInsights,
                  consolidatedFrom: m.consolidatedFrom,
                  timestamp: new Date(m.timestamp).toISOString()
                }))
              }, null, 2)
            }
          ]
        };
      }

      case 'consolidate_memory': {
        if (!OPENAI_API_KEY) {
          throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
        }

        const consolidator = new MemoryConsolidator(
          {
            apiKey: OPENAI_API_KEY,
            baseURL: OPENAI_BASE_URL,
            model: OPENAI_MODEL
          },
          storage
        );

        await consolidator.consolidate();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Memory consolidation completed successfully'
              }, null, 2)
            }
          ]
        };
      }

      case 'search_memory': {
        const {
          query,
          topics,
          start_date,
          end_date,
          memory_type = 'both',
          limit = 20
        } = args as {
          query?: string;
          topics?: string[];
          start_date?: string;
          end_date?: string;
          memory_type?: 'short-term' | 'long-term' | 'both';
          limit?: number;
        };

        // Parse dates
        const startDate = start_date ? new Date(start_date).getTime() : undefined;
        const endDate = end_date ? new Date(end_date).getTime() : undefined;

        const searchFilters = {
          query,
          topics,
          startDate,
          endDate,
          limit: Math.min(Math.max(limit, 1), 100)
        };

        const results: any = {
          success: true,
          filters: {
            query: query || 'none',
            topics: topics || [],
            dateRange: start_date && end_date
              ? `${start_date} to ${end_date}`
              : start_date
                ? `from ${start_date}`
                : end_date
                  ? `until ${end_date}`
                  : 'all time',
            memoryType: memory_type
          }
        };

        // Search short-term memories
        if (memory_type === 'short-term' || memory_type === 'both') {
          const conversations = await storage.searchConversations(searchFilters);
          results.shortTermResults = {
            count: conversations.length,
            conversations: conversations.map(c => ({
              conversationId: c.conversationId,
              role: c.role,
              content: c.content,
              timestamp: new Date(c.timestamp).toISOString()
            }))
          };
        }

        // Search long-term memories
        if (memory_type === 'long-term' || memory_type === 'both') {
          const memories = await storage.searchLongTermMemories(searchFilters);
          results.longTermResults = {
            count: memories.length,
            memories: memories.map(m => ({
              summary: m.summary,
              topics: m.topics,
              keyInsights: m.keyInsights,
              consolidatedFrom: m.consolidatedFrom,
              timestamp: new Date(m.timestamp).toISOString()
            }))
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
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

  // Set up nightly memory consolidation worker
  if (ENABLE_CONSOLIDATION && OPENAI_API_KEY) {
    console.error('Setting up memory consolidation worker...');
    console.error(`Model: ${OPENAI_MODEL}`);
    console.error(`Schedule: ${CONSOLIDATION_SCHEDULE}`);

    const consolidator = new MemoryConsolidator(
      {
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL,
        model: OPENAI_MODEL
      },
      storage
    );

    // Schedule the consolidation job
    cron.schedule(CONSOLIDATION_SCHEDULE, async () => {
      console.error('[Cron] Starting scheduled memory consolidation...');
      try {
        await consolidator.consolidate();
        console.error('[Cron] Memory consolidation completed successfully');
      } catch (error) {
        console.error('[Cron] Memory consolidation failed:', error);
      }
    });

    console.error('Memory consolidation worker scheduled successfully');
  } else if (ENABLE_CONSOLIDATION && !OPENAI_API_KEY) {
    console.error('Warning: Consolidation enabled but OPENAI_API_KEY not set. Consolidation worker disabled.');
  } else {
    console.error('Memory consolidation worker is disabled');
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
