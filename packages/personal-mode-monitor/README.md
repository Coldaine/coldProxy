# Personal Mode LLM Monitor

A privacy-focused, user-centric monitoring component for LLM interactions in the ccflare proxy system.

## Overview

The Personal Mode LLM Monitor provides enhanced tracking and analytics capabilities specifically designed for personal use cases. It offers privacy-preserving monitoring, conversation context tracking, and personal quota management.

## Features

### 🔒 Privacy-First Design
- Configurable data retention (default: 7 days, set to -1 for permanent retention)
- Content anonymization for sensitive data
- Minimal data collection approach
- User-controlled data storage
- Optional session cleanup (set sessionTimeoutMs to -1 to disable)

### 📊 Personal Analytics
- Conversation-based interaction tracking
- Token usage analytics by model
- Cost tracking and estimation
- Hourly usage patterns
- Per-session metrics

### 🎯 Personal Quotas
- Configurable token limits per user
- Request count limitations
- Automatic quota reset (daily)
- Real-time quota monitoring
- Warning notifications

### 🗣️ Conversation Context
- Session-based interaction grouping
- Multi-turn conversation tracking
- Session timeout management
- Active session monitoring

## Configuration for Permanent Data Retention

To keep all session data forever (disable automatic cleanup):

```typescript
const monitor = new PersonalModeLLMMonitor(dbOps, {
    dataRetentionDays: -1,        // Disable database cleanup
    sessionTimeoutMs: -1,         // Disable session cleanup
    enableAnonymization: false,   // Optional: disable anonymization
    personalQuotaEnabled: false,  // Optional: disable quotas
});
```

**Configuration Options:**
- `dataRetentionDays: -1` - Never delete database records
- `sessionTimeoutMs: -1` - Never remove sessions from memory
- `enableAnonymization: false` - Store raw content (less privacy)
- `personalQuotaEnabled: false` - Disable quota tracking

## API Endpoints

### Analytics
```
GET /api/personal/analytics/:userId?timeRange=86400000
```
Get personal analytics for a specific user.

**Response:**
```json
{
  "userId": "user-123",
  "timeRangeMs": 86400000,
  "conversationStats": {
    "totalConversations": 5,
    "totalInteractions": 15,
    "totalTokens": 1250,
    "avgTokensPerInteraction": 83.3,
    "totalCost": 0.025
  },
  "modelUsage": [
    {
      "model": "claude-3-sonnet",
      "usage_count": 10,
      "total_tokens": 800
    }
  ],
  "conversationPatterns": [
    {
      "hour": "14",
      "interaction_count": 5
    }
  ],
  "quotaStatus": {
    "tokensUsed": 1250,
    "tokensLimit": 10000,
    "requestsUsed": 15,
    "requestsLimit": 100,
    "resetTime": 1703980800000
  }
}
```

### Session Management
```
GET /api/personal/sessions?userId=user-123
```
Get active sessions for a user.

### Quota Management
```
GET /api/personal/quota/:userId
POST /api/personal/quota/:userId
```
Check or set personal quotas.

**POST Body:**
```json
{
  "tokensLimit": 10000,
  "requestsLimit": 100
}
```

### System Metrics
```
GET /api/personal/metrics
```
Get overall personal mode metrics.

## Configuration

Personal mode can be configured when creating the integration:

```typescript
const personalModeIntegration = new PersonalModeIntegration(dbOps, {
  dataRetentionDays: 7,          // How long to keep data
  maxConversationLength: 100,    // Max interactions per conversation
  enableAnonymization: true,     // Anonymize sensitive content
  personalQuotaEnabled: true,    // Enable quota tracking
  sessionTimeoutMs: 1800000,     // 30 minutes session timeout
});
```

## Usage

### Basic Integration

```typescript
import { PersonalModeIntegration } from "@ccflare/personal-mode-monitor";

// Initialize with database operations
const personalMode = new PersonalModeIntegration(dbOps, true);

// Hook into proxy requests
await personalMode.onProxyRequest(request, proxyRequest);

// Hook into proxy responses  
await personalMode.onProxyResponse(request, response, proxyResponse);
```

### User Identification

The monitor can identify users through headers:
- `x-user-id`: Explicit user ID
- `x-personal-user-id`: Personal mode user ID

If no explicit user ID is provided, it generates an anonymous ID based on IP and User-Agent.

### Session Tracking

Sessions are identified by:
- `x-session-id`: Explicit session ID
- `x-conversation-id`: Conversation ID
- Generated from request characteristics if not provided

## Database Schema

The personal mode monitor creates the following tables:

```sql
CREATE TABLE personal_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  model TEXT,
  token_count INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  interaction_type TEXT DEFAULT 'message',
  anonymized_content TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

## Privacy Features

### Data Anonymization
- Email addresses → `[EMAIL]`
- Phone numbers → `[PHONE]`
- Credit card numbers → `[CARD]`

### Data Retention
- Automatic cleanup of old interactions
- Configurable retention period
- Session cleanup on timeout

### Minimal Collection
- Only essential metadata stored
- Content limited to first 1000 characters
- No storage of full conversation history

## Testing

Run the test suite:

```bash
bun test packages/personal-mode-monitor/tests/
```

## License

MIT - Same as the main ccflare project.