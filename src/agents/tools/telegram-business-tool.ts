import { Type } from "@sinclair/typebox";
import { Bot } from "grammy";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import {
  getActiveBusinessConnectionId,
  listBusinessChats,
  loadChatMessages,
  resolveBusinessStorageDir,
  searchBusinessMessages,
} from "../../telegram/business/index.js";
import { resolveTelegramToken } from "../../telegram/token.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readNumberParam, readStringParam } from "./common.js";

const TELEGRAM_BUSINESS_ACTIONS = ["list_chats", "get_messages", "search", "send"] as const;

const TelegramBusinessToolSchema = Type.Object({
  action: stringEnum(TELEGRAM_BUSINESS_ACTIONS, {
    description:
      "list_chats: list all accessible chats. get_messages: fetch messages from a chat. search: search messages across chats. send: send a message as the operator (only when explicitly instructed).",
  }),
  chatId: Type.Optional(
    Type.Number({
      description: "Chat ID (required for get_messages, search in specific chat, send).",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Max messages to return (default 50 for get_messages, 20 for search).",
    }),
  ),
  before: Type.Optional(
    Type.Number({ description: "Return messages before this message ID (for pagination)." }),
  ),
  after: Type.Optional(
    Type.Number({ description: "Return messages after this message ID (for pagination)." }),
  ),
  query: Type.Optional(Type.String({ description: "Search query text (for search action)." })),
  content: Type.Optional(Type.String({ description: "Message text to send (for send action)." })),
  replyToMessageId: Type.Optional(
    Type.Number({ description: "Message ID to reply to (for send action)." }),
  ),
  accountId: Type.Optional(
    Type.String({ description: "Telegram account ID (for multi-account setups)." }),
  ),
});

function resolveBusinessToolEnabled(cfg: OpenClawConfig): boolean {
  const biz = cfg.channels?.telegram?.business;
  if (!biz?.enabled) {
    return false;
  }
  return biz.tool !== false;
}

function formatTimestamp(unix: number): string {
  return new Date(unix * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

export function createTelegramBusinessTool(opts?: {
  config?: OpenClawConfig;
}): AnyAgentTool | null {
  const cfg = opts?.config ?? loadConfig();
  if (!resolveBusinessToolEnabled(cfg)) {
    return null;
  }

  return {
    label: "Telegram Business",
    name: "telegram_business",
    description:
      "Read the operator's personal Telegram chats via Business Mode. " +
      "Actions: list_chats (list all chats), get_messages (fetch chat history), " +
      "search (text search across chats), send (send a message as the operator — only when explicitly instructed).",
    parameters: TelegramBusinessToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const accountId = readStringParam(params, "accountId");
      const currentCfg = loadConfig();
      const baseDir = resolveBusinessStorageDir(currentCfg, accountId);

      if (action === "list_chats") {
        const chats = listBusinessChats(baseDir);
        if (chats.length === 0) {
          return jsonResult({
            chats: [],
            note: "No business chats found. Ensure business mode is connected and messages have been received.",
          });
        }
        return jsonResult({
          chats: chats.map((c) => ({
            chatId: c.chatId,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            username: c.username,
            lastActivity: new Date(c.lastMessageAt).toISOString(),
            messageCount: c.messageCount,
          })),
        });
      }

      if (action === "get_messages") {
        const chatId = readNumberParam(params, "chatId", { required: true, integer: true })!;
        const limit = readNumberParam(params, "limit", { integer: true });
        const before = readNumberParam(params, "before", { integer: true });
        const after = readNumberParam(params, "after", { integer: true });

        const messages = loadChatMessages(baseDir, chatId, {
          limit: limit ?? 50,
          before: before ?? undefined,
          after: after ?? undefined,
        });

        if (messages.length === 0) {
          return jsonResult({ messages: [], note: "No messages found for this chat." });
        }

        return jsonResult({
          chatId,
          messages: messages.map((m) => ({
            messageId: m.messageId,
            date: formatTimestamp(m.date),
            from:
              [m.fromFirstName, m.fromLastName].filter(Boolean).join(" ") +
              (m.fromUsername ? ` (@${m.fromUsername})` : ""),
            direction: m.direction,
            text: m.text ?? m.caption ?? "",
            ...(m.replyToMessageId ? { replyTo: m.replyToMessageId } : {}),
          })),
        });
      }

      if (action === "search") {
        const query = readStringParam(params, "query", { required: true });
        const chatId = readNumberParam(params, "chatId", { integer: true });
        const limit = readNumberParam(params, "limit", { integer: true });

        const results = searchBusinessMessages(baseDir, query, {
          chatId: chatId ?? undefined,
          limit: limit ?? 20,
        });

        if (results.length === 0) {
          return jsonResult({ results: [], note: `No messages matching "${query}".` });
        }

        return jsonResult({
          query,
          results: results.map((m) => ({
            chatId: m.chatId,
            messageId: m.messageId,
            date: formatTimestamp(m.date),
            from:
              [m.fromFirstName, m.fromLastName].filter(Boolean).join(" ") +
              (m.fromUsername ? ` (@${m.fromUsername})` : ""),
            direction: m.direction,
            text: m.text ?? m.caption ?? "",
          })),
        });
      }

      if (action === "send") {
        const chatId = readNumberParam(params, "chatId", { required: true, integer: true })!;
        const content = readStringParam(params, "content", { required: true });
        const replyToMessageId = readNumberParam(params, "replyToMessageId", { integer: true });

        const connectionId = getActiveBusinessConnectionId(baseDir);
        if (!connectionId) {
          throw new Error(
            "No active business connection found. The operator must connect the bot via Telegram Business settings.",
          );
        }

        const tokenRes = resolveTelegramToken(currentCfg, { accountId });
        if (tokenRes.source === "none" || !tokenRes.token) {
          throw new Error("Telegram bot token not found. Check configuration.");
        }

        const bot = new Bot(tokenRes.token);
        const result = await bot.api.sendMessage(chatId, content, {
          business_connection_id: connectionId,
          ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
        });
        return jsonResult({
          sent: true,
          messageId: result.message_id,
          chatId,
        });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
