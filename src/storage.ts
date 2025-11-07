import { Database } from 'duckdb';
import { promisify } from 'util';

export interface StorageConfig {
  url: string;
}

export interface ConversationEntry {
  id: string;
  timestamp: number;
  role: string;
  content: string;
  conversationId: string;
}

export interface LongTermMemory {
  id: string;
  timestamp: number;
  summary: string;
  topics: string[];
  keyInsights: string[];
  consolidatedFrom: string; // Date range or conversation IDs
}

export interface SearchFilters {
  query?: string;
  topics?: string[];
  startDate?: number;
  endDate?: number;
  limit?: number;
}

export class StorageManager {
  private db: Database | null = null;
  private config: StorageConfig;
  private dbRun: ((sql: string, ...params: any[]) => Promise<void>) | null = null;
  private dbAll: ((sql: string, ...params: any[]) => Promise<any[]>) | null = null;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const storageUrl = this.config.url;
    let dbPath: string;

    // Parse the storage URL
    if (storageUrl.startsWith('file://')) {
      dbPath = storageUrl.replace('file://', '');
    } else if (storageUrl.startsWith('s3://')) {
      // For S3, we'll use DuckDB's httpfs extension
      dbPath = ':memory:';
    } else if (storageUrl.startsWith('gcs://')) {
      // For GCS, we'll use DuckDB's httpfs extension
      dbPath = ':memory:';
    } else {
      // Default to file-based storage
      dbPath = storageUrl;
    }

    return new Promise((resolve, reject) => {
      this.db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        if (!this.db) {
          reject(new Error('Failed to initialize database'));
          return;
        }

        // Create promisified versions of db methods
        this.dbRun = promisify(this.db.run.bind(this.db));
        this.dbAll = promisify(this.db.all.bind(this.db));

        // Initialize extensions and schema
        this.setupDatabase(storageUrl)
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async setupDatabase(storageUrl: string): Promise<void> {
    if (!this.dbRun || !this.db) {
      throw new Error('Database not initialized');
    }

    // Install and load necessary extensions for remote storage
    if (storageUrl.startsWith('s3://') || storageUrl.startsWith('gcs://')) {
      try {
        await this.dbRun("INSTALL httpfs;");
        await this.dbRun("LOAD httpfs;");

        if (storageUrl.startsWith('s3://')) {
          // Configure S3 credentials from environment if available
          const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
          const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
          const region = process.env.AWS_REGION || 'us-east-1';

          if (accessKeyId && secretAccessKey) {
            await this.dbRun(`SET s3_access_key_id='${accessKeyId}';`);
            await this.dbRun(`SET s3_secret_access_key='${secretAccessKey}';`);
            await this.dbRun(`SET s3_region='${region}';`);
          }
        } else if (storageUrl.startsWith('gcs://')) {
          // Configure GCS credentials from environment if available
          const gcsKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
          if (gcsKeyPath) {
            await this.dbRun(`SET gcs_access_key='${gcsKeyPath}';`);
          }
        }
      } catch (err) {
        console.warn('Could not load httpfs extension:', err);
      }
    }

    // Create the conversations table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        role VARCHAR NOT NULL,
        content TEXT NOT NULL,
        conversation_id VARCHAR NOT NULL,
        consolidated BOOLEAN DEFAULT FALSE
      );
    `);

    // Add consolidated column if it doesn't exist (migration for existing databases)
    try {
      await this.dbRun(`
        ALTER TABLE conversations ADD COLUMN consolidated BOOLEAN DEFAULT FALSE;
      `);
      console.log('Added consolidated column to conversations table');
    } catch (err: any) {
      // Column already exists or other error - ignore
      if (!err.message?.includes('already exists') && !err.message?.includes('Duplicate column name')) {
        console.log('Consolidated column likely already exists:', err.message);
      }
    }

    // Create an index on conversation_id and timestamp for faster queries
    await this.dbRun(`
      CREATE INDEX IF NOT EXISTS idx_conversation_timestamp
      ON conversations(conversation_id, timestamp DESC);
    `);

    // Create the long-term memory table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id VARCHAR PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        summary TEXT NOT NULL,
        topics TEXT NOT NULL,
        key_insights TEXT NOT NULL,
        consolidated_from TEXT NOT NULL
      );
    `);

    // Create an index on timestamp for long-term memory
    await this.dbRun(`
      CREATE INDEX IF NOT EXISTS idx_ltm_timestamp
      ON long_term_memory(timestamp DESC);
    `);

    // If using remote storage, sync the initial state
    if (storageUrl.startsWith('s3://') || storageUrl.startsWith('gcs://')) {
      try {
        // Load data from remote storage
        await this.dbRun(`
          CREATE OR REPLACE TABLE conversations AS
          SELECT * FROM read_parquet('${storageUrl}/conversations.parquet');
        `);
      } catch (err) {
        // Table doesn't exist remotely yet, which is fine for new setups
        console.log('No existing remote data found, starting fresh');
      }
    }
  }

  async storeMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<void> {
    if (!this.dbRun) {
      throw new Error('Database not initialized');
    }

    const id = `${conversationId}-${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();

    await this.dbRun(
      `INSERT INTO conversations (id, timestamp, role, content, conversation_id)
       VALUES (?, ?, ?, ?, ?);`,
      id,
      timestamp,
      role,
      content,
      conversationId
    );

    // Sync to remote storage if configured
    await this.syncToRemote();
  }

  async getLastNConversations(n: number = 2): Promise<ConversationEntry[]> {
    if (!this.dbAll) {
      throw new Error('Database not initialized');
    }

    // Get the last N unique conversation IDs
    const conversationIds = await this.dbAll(`
      SELECT DISTINCT conversation_id
      FROM conversations
      ORDER BY MAX(timestamp) DESC
      LIMIT ?;
    `, n);

    if (conversationIds.length === 0) {
      return [];
    }

    // Get all messages for these conversations
    const ids = conversationIds.map((row: any) => row.conversation_id);
    const placeholders = ids.map(() => '?').join(',');

    const messages = await this.dbAll(`
      SELECT id, timestamp, role, content, conversation_id
      FROM conversations
      WHERE conversation_id IN (${placeholders})
      ORDER BY timestamp ASC;
    `, ...ids);

    return messages.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      role: row.role,
      content: row.content,
      conversationId: row.conversation_id
    }));
  }

  async getTodaysConversations(): Promise<ConversationEntry[]> {
    if (!this.dbAll) {
      throw new Error('Database not initialized');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = startOfDay.getTime();

    const messages = await this.dbAll(`
      SELECT id, timestamp, role, content, conversation_id
      FROM conversations
      WHERE timestamp >= ? AND consolidated = FALSE
      ORDER BY timestamp ASC;
    `, startTimestamp);

    return messages.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      role: row.role,
      content: row.content,
      conversationId: row.conversation_id
    }));
  }

  async storeLongTermMemory(
    summary: string,
    topics: string[],
    keyInsights: string[],
    consolidatedFrom: string
  ): Promise<void> {
    if (!this.dbRun) {
      throw new Error('Database not initialized');
    }

    const id = `ltm-${Date.now()}-${Math.random()}`;
    const timestamp = Date.now();

    await this.dbRun(
      `INSERT INTO long_term_memory (id, timestamp, summary, topics, key_insights, consolidated_from)
       VALUES (?, ?, ?, ?, ?, ?);`,
      id,
      timestamp,
      summary,
      JSON.stringify(topics),
      JSON.stringify(keyInsights),
      consolidatedFrom
    );

    await this.syncToRemote();
  }

  async updateLongTermMemory(
    id: string,
    summary: string,
    topics: string[],
    keyInsights: string[],
    consolidatedFrom: string
  ): Promise<void> {
    if (!this.dbRun) {
      throw new Error('Database not initialized');
    }

    const timestamp = Date.now();

    await this.dbRun(
      `UPDATE long_term_memory
       SET timestamp = ?, summary = ?, topics = ?, key_insights = ?, consolidated_from = ?
       WHERE id = ?;`,
      timestamp,
      summary,
      JSON.stringify(topics),
      JSON.stringify(keyInsights),
      consolidatedFrom,
      id
    );

    await this.syncToRemote();
  }

  async getLongTermMemories(limit: number = 10): Promise<LongTermMemory[]> {
    if (!this.dbAll) {
      throw new Error('Database not initialized');
    }

    const memories = await this.dbAll(`
      SELECT id, timestamp, summary, topics, key_insights, consolidated_from
      FROM long_term_memory
      ORDER BY timestamp DESC
      LIMIT ?;
    `, limit);

    return memories.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      summary: row.summary,
      topics: JSON.parse(row.topics),
      keyInsights: JSON.parse(row.key_insights),
      consolidatedFrom: row.consolidated_from
    }));
  }

  async searchConversations(filters: SearchFilters): Promise<ConversationEntry[]> {
    if (!this.dbAll) {
      throw new Error('Database not initialized');
    }

    let sql = `SELECT id, timestamp, role, content, conversation_id FROM conversations WHERE 1=1`;
    const params: any[] = [];

    // Text search in content
    if (filters.query) {
      sql += ` AND LOWER(content) LIKE LOWER(?)`;
      params.push(`%${filters.query}%`);
    }

    // Date range filter
    if (filters.startDate) {
      sql += ` AND timestamp >= ?`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ` AND timestamp <= ?`;
      params.push(filters.endDate);
    }

    sql += ` ORDER BY timestamp DESC`;

    // Limit results
    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const results = await this.dbAll(sql, ...params);

    return results.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      role: row.role,
      content: row.content,
      conversationId: row.conversation_id
    }));
  }

  async searchLongTermMemories(filters: SearchFilters): Promise<LongTermMemory[]> {
    if (!this.dbAll) {
      throw new Error('Database not initialized');
    }

    let sql = `SELECT id, timestamp, summary, topics, key_insights, consolidated_from FROM long_term_memory WHERE 1=1`;
    const params: any[] = [];

    // Text search in summary and key insights
    if (filters.query) {
      sql += ` AND (LOWER(summary) LIKE LOWER(?) OR LOWER(key_insights) LIKE LOWER(?))`;
      params.push(`%${filters.query}%`, `%${filters.query}%`);
    }

    // Topic filter
    if (filters.topics && filters.topics.length > 0) {
      const topicConditions = filters.topics.map(() => `LOWER(topics) LIKE LOWER(?)`).join(' OR ');
      sql += ` AND (${topicConditions})`;
      filters.topics.forEach(topic => params.push(`%"${topic}"%`));
    }

    // Date range filter
    if (filters.startDate) {
      sql += ` AND timestamp >= ?`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ` AND timestamp <= ?`;
      params.push(filters.endDate);
    }

    sql += ` ORDER BY timestamp DESC`;

    // Limit results
    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const results = await this.dbAll(sql, ...params);

    return results.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      summary: row.summary,
      topics: JSON.parse(row.topics),
      keyInsights: JSON.parse(row.key_insights),
      consolidatedFrom: row.consolidated_from
    }));
  }

  async markConversationsAsConsolidated(): Promise<number> {
    if (!this.dbRun || !this.dbAll) {
      throw new Error('Database not initialized');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = startOfDay.getTime();

    // Get count of unconsolidated conversations from today before marking
    const countResult = await this.dbAll(`
      SELECT COUNT(*) as count
      FROM conversations
      WHERE timestamp >= ? AND consolidated = FALSE;
    `, startTimestamp);
    const count = countResult[0]?.count || 0;

    // Mark today's conversations as consolidated
    await this.dbRun(`
      UPDATE conversations
      SET consolidated = TRUE
      WHERE timestamp >= ? AND consolidated = FALSE;
    `, startTimestamp);

    await this.syncToRemote();

    return count;
  }

  async clearShortTermMemory(): Promise<number> {
    if (!this.dbRun || !this.dbAll) {
      throw new Error('Database not initialized');
    }

    // Get count before deletion
    const countResult = await this.dbAll(`SELECT COUNT(*) as count FROM conversations;`);
    const count = countResult[0]?.count || 0;

    // Delete all conversations
    await this.dbRun(`DELETE FROM conversations;`);

    await this.syncToRemote();

    return count;
  }

  private async syncToRemote(): Promise<void> {
    if (!this.dbRun) {
      return;
    }

    const storageUrl = this.config.url;

    if (storageUrl.startsWith('s3://') || storageUrl.startsWith('gcs://')) {
      try {
        // Export conversations to Parquet format for remote storage
        await this.dbRun(`
          COPY conversations TO '${storageUrl}/conversations.parquet'
          (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);
        `);

        // Export long-term memory to Parquet format
        await this.dbRun(`
          COPY long_term_memory TO '${storageUrl}/long_term_memory.parquet'
          (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);
        `);
      } catch (err) {
        console.error('Failed to sync to remote storage:', err);
      }
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      // Sync one last time before closing
      await this.syncToRemote();

      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}
