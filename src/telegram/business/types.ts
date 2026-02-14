/** Persisted snapshot of a Telegram BusinessConnection. */
export type StoredBusinessConnection = {
  /** Unique identifier of the business connection. */
  id: string;
  /** Business account user ID. */
  userId: number;
  /** Private chat ID with the user who created the connection. */
  userChatId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  /** Unix timestamp when the connection was established. */
  date: number;
  /** Whether the connection is currently active. */
  isEnabled: boolean;
  rights?: {
    canReply?: boolean;
    canReadMessages?: boolean;
    canDeleteOutgoingMessages?: boolean;
    canDeleteAllMessages?: boolean;
  };
  /** Epoch ms when this record was last written. */
  updatedAt: number;
};

/** Versioned store for business connections. */
export type BusinessConnectionStore = {
  version: 1;
  /** Keyed by connection ID. */
  connections: Record<string, StoredBusinessConnection>;
};

/** A single business message record stored in JSONL. */
export type StoredBusinessMessage = {
  messageId: number;
  /** Unix timestamp from Telegram. */
  date: number;
  /** Epoch ms when this record was stored. */
  storedAt: number;
  fromId: number;
  fromFirstName: string;
  fromLastName?: string;
  fromUsername?: string;
  text?: string;
  caption?: string;
  /** 'incoming' = someone wrote to operator, 'outgoing' = operator sent. */
  direction: "incoming" | "outgoing";
  replyToMessageId?: number;
  businessConnectionId: string;
  /** 'new' = new message, 'edited' = edit of existing, 'deleted' = deletion marker. */
  event: "new" | "edited" | "deleted";
  /** For 'deleted' events: the message IDs that were deleted. */
  deletedMessageIds?: number[];
};

/** Per-chat metadata stored alongside the JSONL message log. */
export type StoredChatMeta = {
  chatId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  /** Epoch ms of the most recent message. */
  lastMessageAt: number;
  /** Total stored message records (including edits/deletions). */
  messageCount: number;
};
