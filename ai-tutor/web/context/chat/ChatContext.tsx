"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { wsUrl, apiUrl } from "@/lib/api";
import {
  ChatState,
  HomeChatMessage,
  INITIAL_CHAT_STATE,
  type ThinkingPhaseId,
} from "@/types/chat";

// Context type
interface ChatContextType {
  chatState: ChatState;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
  sendChatMessage: (message: string) => void;
  clearChatHistory: () => void;
  loadChatSession: (sessionId: string) => Promise<void>;
  newChatSession: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  initialKnowledgeBase = "",
}: {
  children: React.ReactNode;
  initialKnowledgeBase?: string;
}) {
  const [chatState, setChatState] = useState<ChatState>(() => ({
    ...INITIAL_CHAT_STATE,
    selectedKb: initialKnowledgeBase,
  }));
  const chatWs = useRef<WebSocket | null>(null);
  // Use ref to always have the latest sessionId in WebSocket callbacks
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => chatWs.current?.close();
  }, []);

  const sendChatMessage = useCallback(
    (message: string) => {
      if (!message.trim() || chatState.isLoading) return;

      // Add user message
      setChatState((prev) => ({
        ...prev,
        isLoading: true,
        currentStage: "connecting",
        thinkingTrace: prev.enableThinking
          ? [
              { phase: "understand", status: "pending" },
              { phase: "retrieve", status: "pending" },
              { phase: "structure", status: "pending" },
              { phase: "write", status: "pending" },
            ]
          : [],
        messages: [...prev.messages, { role: "user", content: message }],
      }));

      // Close existing connection if any
      if (chatWs.current) {
        chatWs.current.close();
      }

      const ws = new WebSocket(wsUrl("/api/v1/chat"));
      chatWs.current = ws;

      let assistantMessage = "";

      ws.onopen = () => {
        // Build history from current messages (excluding the one just added)
        const history = chatState.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // General mode forces both rag and web search off — model answers from its own knowledge
        const effectiveRag = chatState.enableGeneral ? false : chatState.enableRag;
        const effectiveWebSearch = chatState.enableGeneral ? false : chatState.enableWebSearch;

        ws.send(
        JSON.stringify({
          message,
          session_id: sessionIdRef.current,
          history,
          kb_name: chatState.selectedKb,
          pdf_url: chatState.selectedPdfUrl || undefined,
          enable_rag: effectiveRag,
          enable_web_search: effectiveWebSearch,
          enable_thinking: chatState.enableThinking,
          enable_general: chatState.enableGeneral,
        }),
      );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "session") {
          sessionIdRef.current = data.session_id;
          setChatState((prev) => ({
            ...prev,
            sessionId: data.session_id,
          }));
        } else if (data.type === "thinking_phase") {
          const phase = data.phase as ThinkingPhaseId;
          const now = Date.now();
          const isActive = data.status === "active";
          setChatState((prev) => ({
            ...prev,
            thinkingTrace: prev.thinkingTrace.map((row) => {
              if (row.phase !== phase) return row;
              if (isActive) return { ...row, status: "active", startedAt: now };
              return {
                ...row,
                status: "done",
                elapsedMs: row.startedAt ? now - row.startedAt : undefined,
              };
            }),
          }));
        } else if (data.type === "status") {
          setChatState((prev) => ({
            ...prev,
            currentStage: data.stage || data.message,
          }));
        } else if (data.type === "stream") {
          assistantMessage += data.content;
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant" && lastMessage?.isStreaming) {
              messages[messages.length - 1] = {
                ...lastMessage,
                content: assistantMessage,
              };
            } else {
              messages.push({
                role: "assistant",
                content: assistantMessage,
                isStreaming: true,
                // Stamp thinking flag so the card style persists after streaming ends
                isThinking: prev.enableThinking,
              });
            }
            return { ...prev, messages, currentStage: "generating" };
          });
        } else if (data.type === "sources") {
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant") {
              messages[messages.length - 1] = {
                ...lastMessage,
                sources: {
                  rag: data.rag,
                  web: data.web,
                  videos: data.videos ?? [],
                },
              };
            }
            return { ...prev, messages };
          });
        } else if (data.type === "result") {
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant") {
              messages[messages.length - 1] = {
                ...lastMessage,
                content: data.content,
                isStreaming: false,
              };
            }
            return {
              ...prev,
              messages,
              isLoading: false,
              currentStage: null,
              thinkingTrace: [],
            };
          });
        } else if (data.type === "image") {
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant") {
              messages[messages.length - 1] = {
                ...lastMessage,
                imageUrl: data.url,
                imageTitle: data.title,
                imageDescription: data.description,
                imageSourceUrl: data.source_url,
              };
            }
            return { ...prev, messages };
          });
        } else if (data.type === "related_diagram") {
          const m = typeof data.mermaid === "string" ? data.mermaid.trim() : "";
          if (m) {
            setChatState((prev) => {
              const messages = [...prev.messages];
              const lastMessage = messages[messages.length - 1];
              if (lastMessage?.role === "assistant") {
                messages[messages.length - 1] = {
                  ...lastMessage,
                  relatedDiagramMermaid: m,
                  relatedDiagramTitle:
                    typeof data.title === "string" ? data.title : "",
                };
              }
              return { ...prev, messages };
            });
          }
        } else if (data.type === "images") {
          // Web images fetched from AI response keywords (Wikimedia search pipeline)
          console.log(
            "[ImagePipeline] ChatContext received",
            data.images?.length ?? 0,
            "web image(s):",
            data.images
          );
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant") {
              messages[messages.length - 1] = {
                ...lastMessage,
                webImages: data.images ?? [],
              };
            }
            return { ...prev, messages };
          });
        } else if (data.type === "composed_content") {
          // Composer Agent output: text with inline images
          setChatState((prev) => {
            const messages = [...prev.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage?.role === "assistant") {
              messages[messages.length - 1] = {
                ...lastMessage,
                content: data.content,  // Replace with composed content that has inline images
                composedContent: data.content,
                ragImages: data.images ?? [],
              };
            }
            return { ...prev, messages };
          });
        } else if (data.type === "error") {
          setChatState((prev) => ({
            ...prev,
            isLoading: false,
            currentStage: null,
            thinkingTrace: [],
            messages: [
              ...prev.messages,
              { role: "assistant", content: `Error: ${data.message}` },
            ],
          }));
          ws.close();
        }
      };

      ws.onerror = () => {
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          currentStage: null,
          thinkingTrace: [],
          messages: [
            ...prev.messages,
            {
              role: "assistant",
              content: "Connection error. Please try again.",
            },
          ],
        }));
      };

      ws.onclose = () => {
        if (chatWs.current === ws) {
          chatWs.current = null;
        }
        setChatState((prev) => ({
          ...prev,
          isLoading: false,
          currentStage: null,
          thinkingTrace: [],
        }));
      };
    },
    [
      chatState.isLoading,
      chatState.messages,
      chatState.selectedKb,
      chatState.selectedPdfUrl,
      chatState.enableRag,
      chatState.enableWebSearch,
      chatState.enableThinking,
      chatState.enableGeneral,
    ],
  );

  const clearChatHistory = useCallback(() => {
    sessionIdRef.current = null;
    setChatState((prev) => ({
      ...prev,
      sessionId: null,
      messages: [],
      currentStage: null,
      thinkingTrace: [],
    }));
  }, []);

  const newChatSession = useCallback(() => {
    if (chatWs.current) {
      chatWs.current.close();
      chatWs.current = null;
    }
    sessionIdRef.current = null;
    setChatState((prev) => ({
      ...prev,
      sessionId: null,
      messages: [],
      isLoading: false,
      currentStage: null,
      thinkingTrace: [],
    }));
  }, []);

  const loadChatSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(
        apiUrl(`/api/v1/chat/sessions/${sessionId}`),
      );
      if (!response.ok) {
        throw new Error("Session not found");
      }
      const session = await response.json();

      const messages: HomeChatMessage[] = session.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        isStreaming: false,
        isThinking: msg.is_thinking ?? false,
      }));

      const settings = session.settings || {};

      sessionIdRef.current = session.session_id;

      setChatState((prev) => ({
        ...prev,
        sessionId: session.session_id,
        messages,
        selectedKb: settings.kb_name || prev.selectedKb,
        enableRag: settings.enable_rag ?? prev.enableRag,
        enableWebSearch: settings.enable_web_search ?? prev.enableWebSearch,
        enableThinking: settings.enable_thinking ?? prev.enableThinking,
        isLoading: false,
        currentStage: null,
        thinkingTrace: [],
      }));
    } catch (error) {
      console.error("Failed to load session:", error);
      throw error;
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{
        chatState,
        setChatState,
        sendChatMessage,
        clearChatHistory,
        loadChatSession,
        newChatSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
};
