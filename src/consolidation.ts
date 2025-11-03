import OpenAI from 'openai';
import { StorageManager, ConversationEntry, LongTermMemory } from './storage.js';

export interface ConsolidationConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
}

export class MemoryConsolidator {
  private openai: OpenAI;
  private model: string;
  private storage: StorageManager;

  constructor(config: ConsolidationConfig, storage: StorageManager) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
    this.storage = storage;
  }

  async consolidate(): Promise<void> {
    console.error('[Consolidation] Starting memory consolidation process...');

    try {
      // Get today's short-term memories
      const todayConversations = await this.storage.getTodaysConversations();

      if (todayConversations.length === 0) {
        console.error('[Consolidation] No conversations to consolidate today.');
        return;
      }

      console.error(`[Consolidation] Found ${todayConversations.length} messages from today.`);

      // Get existing long-term memories for context
      const existingMemories = await this.storage.getLongTermMemories(20);
      console.error(`[Consolidation] Retrieved ${existingMemories.length} existing long-term memories.`);

      // Use LLM to consolidate
      const consolidatedMemory = await this.performConsolidation(
        todayConversations,
        existingMemories
      );

      // Store the consolidated memory
      await this.storage.storeLongTermMemory(
        consolidatedMemory.summary,
        consolidatedMemory.topics,
        consolidatedMemory.keyInsights,
        consolidatedMemory.consolidatedFrom
      );

      console.error('[Consolidation] Stored consolidated memory.');

      // Mark short-term memories as consolidated
      const markedCount = await this.storage.markConversationsAsConsolidated();
      console.error(`[Consolidation] Marked ${markedCount} conversations as consolidated.`);

      console.error('[Consolidation] Memory consolidation completed successfully!');
    } catch (error) {
      console.error('[Consolidation] Error during consolidation:', error);
      throw error;
    }
  }

  private async performConsolidation(
    shortTermMemories: ConversationEntry[],
    longTermMemories: LongTermMemory[]
  ): Promise<{
    summary: string;
    topics: string[];
    keyInsights: string[];
    consolidatedFrom: string;
  }> {
    // Format short-term memories for the LLM
    const conversationText = this.formatConversations(shortTermMemories);

    // Format existing long-term memories for context
    const longTermContext = this.formatLongTermMemories(longTermMemories);

    // Create the consolidation prompt
    const prompt = this.buildConsolidationPrompt(conversationText, longTermContext);

    // Call the LLM
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are a memory consolidation assistant. Your task is to analyze conversations and consolidate them into long-term memories. You should:
1. Extract key insights and important information
2. Identify main topics discussed
3. Create a comprehensive summary
4. Consider existing long-term memories to avoid duplication and find connections
5. Focus on what's important to remember long-term

Respond ONLY with valid JSON in this exact format:
{
  "summary": "A comprehensive summary of the conversations",
  "topics": ["topic1", "topic2", "topic3"],
  "keyInsights": ["insight1", "insight2", "insight3"]
}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0].message.content || '{}';

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      console.error('[Consolidation] Failed to parse LLM response as JSON:', error);
      console.error('[Consolidation] Response was:', responseText);
      // Return a safe default if parsing fails
      parsed = {
        summary: 'Failed to parse consolidation response',
        topics: [],
        keyInsights: []
      };
    }

    const today = new Date().toISOString().split('T')[0];

    return {
      summary: parsed.summary || 'No summary generated',
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      consolidatedFrom: `Conversations from ${today}`
    };
  }

  private formatConversations(conversations: ConversationEntry[]): string {
    const grouped = new Map<string, ConversationEntry[]>();

    // Group by conversation ID
    conversations.forEach(conv => {
      if (!grouped.has(conv.conversationId)) {
        grouped.set(conv.conversationId, []);
      }
      grouped.get(conv.conversationId)!.push(conv);
    });

    let formatted = '';
    let convNum = 1;

    for (const [convId, messages] of grouped.entries()) {
      formatted += `\n=== Conversation ${convNum} ===\n`;
      messages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        formatted += `[${time}] ${msg.role}: ${msg.content}\n`;
      });
      convNum++;
    }

    return formatted;
  }

  private formatLongTermMemories(memories: LongTermMemory[]): string {
    if (memories.length === 0) {
      return 'No existing long-term memories.';
    }

    let formatted = '';
    memories.forEach((mem, idx) => {
      const date = new Date(mem.timestamp).toLocaleDateString();
      formatted += `\n--- Memory ${idx + 1} (from ${date}) ---\n`;
      formatted += `Summary: ${mem.summary}\n`;
      formatted += `Topics: ${mem.topics.join(', ')}\n`;
      formatted += `Key Insights: ${mem.keyInsights.join('; ')}\n`;
    });

    return formatted;
  }

  private buildConsolidationPrompt(
    conversationText: string,
    longTermContext: string
  ): string {
    return `# Task: Consolidate Today's Conversations into Long-Term Memory

## Today's Conversations:
${conversationText}

## Existing Long-Term Memories (for context):
${longTermContext}

## Instructions:
Please analyze today's conversations and create a consolidated long-term memory entry. Consider:
1. What are the main topics discussed today?
2. What key insights or important information should be remembered?
3. How does this relate to existing long-term memories?
4. What would be valuable to recall in future conversations?

Provide your response as JSON with:
- summary: A comprehensive 2-3 sentence summary
- topics: Array of 3-5 main topics (as short strings)
- keyInsights: Array of 3-7 key insights or important facts to remember`;
  }
}
