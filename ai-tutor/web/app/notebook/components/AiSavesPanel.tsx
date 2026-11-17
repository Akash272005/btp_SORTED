"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Search,
  Clock,
  FileText,
  Calculator,
  Microscope,
  PenTool,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  X,
  Check,
  Palette,
  MoreVertical,
  FolderOpen,
  Database,
  Maximize2,
  Minimize2,
  Download,
  History,
  MessageSquare,
  Loader2,
  Pencil,
  Bot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import { useGlobal } from "@/context/GlobalContext";
import { getPortalChatHref } from "@/lib/portalAiRoutes";
import { useAuthStore } from "@/store/authStore";
import NotebookRecordOutput from "@/components/notebook/NotebookRecordOutput";
import {
  getChatMessagesFromRecord,
  getNotebookSessionId,
  isHtmlDocument,
  metadataAfterChatOutputEdit,
} from "@/lib/notebookRecordContent";
import { useTranslation } from "react-i18next";
import SelectionSaveToolbar from "@/components/notes/SelectionSaveToolbar";
import SaveToNotesModal from "@/components/SaveToNotesModal";
import NotesEditor from "@/components/notes/NotesEditor";
import { markdownToEditableHtml } from "@/lib/notebookRecordHtml";

interface NotebookRecord {
  id: string;
  type: "solve" | "question" | "research" | "co_writer" | "chat";
  title: string;
  user_query: string;
  output: string;
  metadata: Record<string, any>;
  created_at: number;
  kb_name?: string;
}

interface Notebook {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  records: NotebookRecord[];
  color: string;
  icon: string;
}

interface NotebookSummary {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  record_count: number;
  color: string;
  icon: string;
}

const COLORS = [
  "#3B82F6", // blue
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#06B6D4", // cyan
  "#6366F1", // indigo
];

const getRecordIcon = (type: string) => {
  switch (type) {
    case "solve":
      return <Calculator className="w-4 h-4" />;
    case "question":
      return <FileText className="w-4 h-4" />;
    case "research":
      return <Microscope className="w-4 h-4" />;
    case "co_writer":
      return <PenTool className="w-4 h-4" />;
    case "chat":
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
};

const getRecordLabel = (type: string) => {
  switch (type) {
    case "solve":
      return "Solver";
    case "question":
      return "Question";
    case "research":
      return "Research";
    case "co_writer":
      return "Co-Writer";
    case "chat":
      return "Chat";
    default:
      return "Record";
  }
};

const getRecordColor = (type: string) => {
  switch (type) {
    case "solve":
      return "text-blue-500 bg-blue-50 border-blue-200";
    case "question":
      return "text-purple-500 bg-purple-50 border-purple-200";
    case "research":
      return "text-emerald-500 bg-emerald-50 border-emerald-200";
    case "co_writer":
      return "text-amber-500 bg-amber-50 border-amber-200";
    case "chat":
      return "text-cyan-500 bg-cyan-50 border-cyan-200";
    default:
      return "text-slate-500 bg-slate-50 border-slate-200";
  }
};

export default function AiSavesPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const userRole = useAuthStore((s) => s.user?.role);
  const {
    loadChatSession,
    loadQuestionFromNotebook,
    loadSolverFromNotebook,
    loadCoWriterFromNotebook,
  } = useGlobal();
  const [loadingChatSession, setLoadingChatSession] = useState(false);
  const [loadingQuestionGen, setLoadingQuestionGen] = useState(false);
  const [loadingSolver, setLoadingSolver] = useState(false);
  const [loadingCoWriter, setLoadingCoWriter] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const [showSaveToNotesModal, setShowSaveToNotesModal] = useState(false);
  const [saveToNotesPayload, setSaveToNotesPayload] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [recordEditDraft, setRecordEditDraft] = useState({
    title: "",
    user_query: "",
    outputHtml: "",
  });
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordSaveMessage, setRecordSaveMessage] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(
    null,
  );
  const [selectedRecord, setSelectedRecord] = useState<NotebookRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Collapse states
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [middleCollapsed, setMiddleCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );

  // Form states
  const [newNotebook, setNewNotebook] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });
  const [editingNotebook, setEditingNotebook] = useState<{
    id: string;
    name: string;
    description: string;
    color: string;
  } | null>(null);

  // Layout state for expandable detail panel (deprecated, using rightCollapsed instead)
  const [detailExpanded, setDetailExpanded] = useState(false);

  // Fetch notebooks
  useEffect(() => {
    fetchNotebooks();
  }, []);

  useEffect(() => {
    setIsEditingRecord(false);
    setRecordSaveMessage("idle");
  }, [selectedRecord?.id]);

  const recordUsesPlainOutputEdit = (record: NotebookRecord) => {
    const chatMessages = getChatMessagesFromRecord(record);
    return (
      !!chatMessages &&
      (record.type === "chat" || chatMessages.length >= 2)
    );
  };

  const startEditingRecord = () => {
    if (!selectedRecord) return;
    setRecordEditDraft({
      title: selectedRecord.title,
      user_query: selectedRecord.user_query,
      outputHtml: recordUsesPlainOutputEdit(selectedRecord)
        ? selectedRecord.output
        : markdownToEditableHtml(selectedRecord.output),
    });
    setIsEditingRecord(true);
    setRecordSaveMessage("idle");
  };

  const cancelEditingRecord = () => {
    setIsEditingRecord(false);
    setRecordSaveMessage("idle");
  };

  const handleSaveRecordEdits = async () => {
    if (!selectedNotebook || !selectedRecord) return;
    setRecordSaving(true);
    setRecordSaveMessage("idle");
    const output = recordEditDraft.outputHtml;
    const isChatTranscriptEdit =
      selectedRecord.type === "chat" ||
      recordUsesPlainOutputEdit(selectedRecord);
    const metadata = isChatTranscriptEdit
      ? metadataAfterChatOutputEdit(selectedRecord.metadata, output)
      : undefined;
    try {
      const res = await fetch(
        apiUrl(
          `/api/v1/notebook/${selectedNotebook.id}/records/${selectedRecord.id}`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: recordEditDraft.title.trim() || selectedRecord.title,
            user_query: recordEditDraft.user_query,
            output,
            ...(metadata ? { metadata } : {}),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || "Save failed");
      }
      const updated = data.record as NotebookRecord;
      setSelectedRecord(updated);
      setSelectedNotebook((prev) =>
        prev
          ? {
              ...prev,
              records: prev.records.map((r) =>
                r.id === updated.id ? updated : r,
              ),
            }
          : null,
      );
      setIsEditingRecord(false);
      setRecordSaveMessage("saved");
      window.setTimeout(() => setRecordSaveMessage("idle"), 2500);
    } catch (err) {
      console.error("Failed to update record:", err);
      setRecordSaveMessage("error");
    } finally {
      setRecordSaving(false);
    }
  };

  const fetchNotebooks = async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/notebook/list"));
      const data = await res.json();
      setNotebooks(data.notebooks || []);
    } catch (err) {
      console.error("Failed to fetch notebooks:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotebookDetail = async (notebookId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/notebook/${notebookId}`));
      const data = await res.json();
      setSelectedNotebook(data);
      setSelectedRecord(null);
    } catch (err) {
      console.error("Failed to fetch notebook detail:", err);
    }
  };

  const handleCreateNotebook = async () => {
    if (!newNotebook.name.trim()) return;

    try {
      const res = await fetch(apiUrl("/api/v1/notebook/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNotebook),
      });
      const data = await res.json();
      if (data.success) {
        fetchNotebooks();
        setShowCreateModal(false);
        setNewNotebook({ name: "", description: "", color: "#3B82F6" });
      }
    } catch (err) {
      console.error("Failed to create notebook:", err);
    }
  };

  const handleUpdateNotebook = async () => {
    if (!editingNotebook || !editingNotebook.name.trim()) return;

    try {
      const res = await fetch(
        apiUrl(`/api/v1/notebook/${editingNotebook.id}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingNotebook.name,
            description: editingNotebook.description,
            color: editingNotebook.color,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        fetchNotebooks();
        if (selectedNotebook?.id === editingNotebook.id) {
          fetchNotebookDetail(editingNotebook.id);
        }
        setShowEditModal(false);
        setEditingNotebook(null);
      }
    } catch (err) {
      console.error("Failed to update notebook:", err);
    }
  };

  const handleDeleteNotebook = async (notebookId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/notebook/${notebookId}`), {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchNotebooks();
        if (selectedNotebook?.id === notebookId) {
          setSelectedNotebook(null);
        }
        setShowDeleteConfirm(null);
      }
    } catch (err) {
      console.error("Failed to delete notebook:", err);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!selectedNotebook) return;

    try {
      const res = await fetch(
        apiUrl(`/api/v1/notebook/${selectedNotebook.id}/records/${recordId}`),
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (data.success) {
        fetchNotebookDetail(selectedNotebook.id);
        if (selectedRecord?.id === recordId) {
          setSelectedRecord(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete record:", err);
    }
  };

  // Export functions
  const exportAsMarkdown = () => {
    if (!selectedRecord) return;

    const content = `# ${selectedRecord.title}\n\n**Type:** ${selectedRecord.type}\n**Created:** ${new Date(selectedRecord.created_at * 1000).toLocaleString()}\n\n## ${t("User Query")}\n\n${selectedRecord.user_query}\n\n## ${t("Output")}\n\n${selectedRecord.output}`;

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedRecord.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = async () => {
    if (!selectedRecord) return;

    // Use browser print for simple PDF export
    const printContent = `
      <html>
        <head>
          <title>${selectedRecord.title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #1e293b; }
            .meta { color: #64748b; font-size: 14px; margin-bottom: 20px; }
            .section { margin: 20px 0; }
            .section-title { font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }
            .query { background: #eff6ff; padding: 16px; border-radius: 8px; }
            .output { background: #f8fafc; padding: 16px; border-radius: 8px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${selectedRecord.title}</h1>
          <div class="meta">${selectedRecord.type.toUpperCase()} • ${new Date(selectedRecord.created_at * 1000).toLocaleString()}</div>
          <div class="section">
            <div class="section-title">${t("User Query")}</div>
            <div class="query">${selectedRecord.user_query}</div>
          </div>
          <div class="section">
            <div class="section-title">${t("Output")}</div>
            <div class="output">${selectedRecord.output}</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const filteredNotebooks = notebooks.filter(
    (nb) =>
      nb.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nb.description.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div
      className="h-full min-h-0 flex gap-4 animate-fade-in"
      style={{ justifyContent: "flex-start" }}
    >
      {/* Left Panel: Notebook List */}
      <div
        className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300 flex-shrink-0 ${leftCollapsed ? "overflow-hidden" : ""}`}
        style={{
          width: leftCollapsed ? 0 : "288px",
          minWidth: leftCollapsed ? 0 : "288px",
          maxWidth: leftCollapsed ? 0 : "288px",
          opacity: leftCollapsed ? 0 : 1,
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              {t("Notebooks")}
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLeftCollapsed(true)}
                className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all"
                title={t("Collapse left panel")}
              >
                <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={t("Search notebooks...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Notebook List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500">
              {t("Loading")}
            </div>
          ) : filteredNotebooks.length === 0 ? (
            <div className="p-8 text-center">
              <FolderOpen className="w-12 h-12 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {t("No notebooks yet")}
              </p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                {t("Create your first notebook to get started")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotebooks.map((nb) => (
                <div
                  key={nb.id}
                  onClick={() => fetchNotebookDetail(nb.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all group ${
                    selectedNotebook?.id === nb.id
                      ? "bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-700"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border-2 border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${nb.color}20`,
                        color: nb.color,
                      }}
                    >
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm">
                          {nb.name}
                        </h3>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingNotebook({
                                id: nb.id,
                                name: nb.name,
                                description: nb.description,
                                color: nb.color,
                              });
                              setShowEditModal(true);
                            }}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                          >
                            <Edit3 className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(nb.id);
                            }}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
                          >
                            <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                          </button>
                        </div>
                      </div>
                      {nb.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {nb.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {nb.record_count} records
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(nb.updated_at * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {leftCollapsed && (
        <button
          onClick={() => setLeftCollapsed(false)}
          className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all self-start mt-4 shrink-0"
          title={t("Expand left panel")}
        >
          <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Middle Panel: Records List */}
      <div
        className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300 flex-shrink-0 ${middleCollapsed ? "overflow-hidden" : ""}`}
        style={{
          width: middleCollapsed ? 0 : "320px",
          minWidth: middleCollapsed ? 0 : "320px",
          maxWidth: middleCollapsed ? 0 : "320px",
          opacity: middleCollapsed ? 0 : 1,
        }}
      >
        {/* Notebook Header */}
        <div
          className="p-4 border-b border-slate-100 dark:border-slate-700 shrink-0"
          style={{
            backgroundColor: selectedNotebook
              ? `${selectedNotebook.color}10`
              : "transparent",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            {selectedNotebook ? (
              <>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${selectedNotebook.color}20`,
                      color: selectedNotebook.color,
                    }}
                  >
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {selectedNotebook.name}
                    </h2>
                    {selectedNotebook.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {selectedNotebook.description}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1" />
            )}
            <button
              onClick={() => setMiddleCollapsed(true)}
              className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all shrink-0"
              title={t("Collapse middle panel")}
            >
              <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {selectedNotebook ? (
          <>
            {/* Records List */}
            <div className="flex-1 overflow-y-auto p-3">
              {selectedNotebook.records.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {t("No records yet")}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                    {t(
                      "Add records from Solver, Question, Research, or Co-Writer",
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedNotebook.records.map((record) => (
                    <div
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className={`p-3 rounded-xl cursor-pointer transition-all group border ${
                        selectedRecord?.id === record.id
                          ? "bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg border ${getRecordColor(record.type)}`}
                        >
                          {getRecordIcon(record.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${getRecordColor(record.type)}`}
                            >
                              {getRecordLabel(record.type)}
                            </span>
                            {record.kb_name && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                                <Database className="w-3 h-3" />
                                {record.kb_name}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                            {record.title}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {record.user_query}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {new Date(
                                record.created_at * 1000,
                              ).toLocaleString()}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRecord(record.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all"
                            >
                              <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
            <BookOpen className="w-16 h-16 text-slate-200 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {t("Select a notebook to view records")}
            </p>
          </div>
        )}
      </div>
      {middleCollapsed && (
        <button
          onClick={() => setMiddleCollapsed(false)}
          className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all self-start mt-4 shrink-0"
          title={t("Expand middle panel")}
        >
          <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Right Panel: Record Detail */}
      <div
        className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300 ${rightCollapsed ? "flex-shrink-0 overflow-hidden" : "flex-1"}`}
        style={{
          width: rightCollapsed ? 0 : undefined,
          minWidth: rightCollapsed ? 0 : undefined,
          maxWidth: rightCollapsed ? 0 : undefined,
          opacity: rightCollapsed ? 0 : 1,
          marginLeft: "auto",
          order: 3,
        }}
      >
        {/* Record Header with Action Buttons */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setRightCollapsed(true)}
                className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all shrink-0"
                title={t("Collapse right panel")}
              >
                <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
              {selectedRecord ? (
                <>
                  <div
                    className={`p-2 rounded-lg border ${getRecordColor(selectedRecord.type)} shrink-0`}
                  >
                    {getRecordIcon(selectedRecord.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditingRecord ? (
                      <input
                        type="text"
                        value={recordEditDraft.title}
                        onChange={(e) =>
                          setRecordEditDraft((d) => ({
                            ...d,
                            title: e.target.value,
                          }))
                        }
                        className="w-full font-bold text-slate-900 dark:text-slate-100 bg-white/80 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <h2 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {selectedRecord.title}
                      </h2>
                    )}
                    <div className="mt-1">
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${getRecordColor(selectedRecord.type)}`}
                      >
                        {getRecordLabel(selectedRecord.type)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1" />
              )}
            </div>

            {/* Action Buttons - Export and History */}
            {selectedRecord && (
              <div className="flex flex-col items-end gap-2 shrink-0">
                {recordSaveMessage === "saved" && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t("notes.record_saved")}
                  </span>
                )}
                {recordSaveMessage === "error" && (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    {t("notes.record_save_failed")}
                  </span>
                )}
                {isEditingRecord ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveRecordEdits()}
                      disabled={recordSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                    >
                      {recordSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      {t("notes.save_changes")}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingRecord}
                      disabled={recordSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t("notes.cancel_edit")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        onClick={exportAsMarkdown}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title={t("Export as Markdown")}
                      >
                        <Download className="w-3.5 h-3.5" />
                        .md
                      </button>
                      <button
                        onClick={exportAsPDF}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title={t("Export as PDF")}
                      >
                        <Download className="w-3.5 h-3.5" />
                        .pdf
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {selectedRecord.type === "chat" &&
                        getNotebookSessionId(selectedRecord.metadata) && (
                          <button
                            type="button"
                            disabled={loadingChatSession}
                            onClick={() => {
                              const sessionId = getNotebookSessionId(
                                selectedRecord.metadata,
                              );
                              if (!sessionId) return;
                              setLoadingChatSession(true);
                              void loadChatSession(sessionId)
                                .then(() =>
                                  router.push(getPortalChatHref(userRole)),
                                )
                                .catch(console.error)
                                .finally(() => setLoadingChatSession(false));
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-700 rounded-lg disabled:opacity-50"
                          >
                            {loadingChatSession ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5" />
                            )}
                            {t("notes.open_in_chat")}
                          </button>
                        )}
                      {selectedRecord.type === "question" && (
                        <button
                          type="button"
                          disabled={loadingQuestionGen}
                          onClick={() => {
                            setLoadingQuestionGen(true);
                            try {
                              loadQuestionFromNotebook({
                                user_query: selectedRecord.user_query,
                                output: selectedRecord.output,
                                metadata: selectedRecord.metadata,
                                kb_name: selectedRecord.kb_name,
                              });
                              router.push("/question");
                            } catch (err) {
                              console.error(err);
                              alert(
                                t("notes.open_in_question_generator_failed"),
                              );
                            } finally {
                              setLoadingQuestionGen(false);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 rounded-lg disabled:opacity-50"
                        >
                          {loadingQuestionGen ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PenTool className="w-3.5 h-3.5" />
                          )}
                          {t("notes.open_in_question_generator")}
                        </button>
                      )}
                      {selectedRecord.type === "solve" && (
                        <button
                          type="button"
                          disabled={loadingSolver}
                          onClick={() => {
                            setLoadingSolver(true);
                            void loadSolverFromNotebook({
                              user_query: selectedRecord.user_query,
                              output: selectedRecord.output,
                              metadata: selectedRecord.metadata,
                              kb_name: selectedRecord.kb_name,
                            })
                              // Restore saved tab (upload/draw/type) when opening from notebook.
                              .then((inputMode) =>
                                router.push(
                                  `/solver?tab=${encodeURIComponent(inputMode)}`,
                                ),
                              )
                              .catch((err) => {
                                console.error(err);
                                alert(t("notes.open_in_smart_solver_failed"));
                              })
                              .finally(() => setLoadingSolver(false));
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50"
                        >
                          {loadingSolver ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Bot className="w-3.5 h-3.5" />
                          )}
                          {t("notes.open_in_smart_solver")}
                        </button>
                      )}
                      {selectedRecord.type === "co_writer" && (
                        <button
                          type="button"
                          disabled={loadingCoWriter}
                          onClick={() => {
                            setLoadingCoWriter(true);
                            try {
                              loadCoWriterFromNotebook({
                                user_query: selectedRecord.user_query,
                                output: selectedRecord.output,
                                metadata: selectedRecord.metadata,
                                kb_name: selectedRecord.kb_name,
                                title: selectedRecord.title,
                              });
                              router.push("/co_writer");
                            } catch (err) {
                              console.error(err);
                              alert(t("notes.open_in_co_writer_failed"));
                            } finally {
                              setLoadingCoWriter(false);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 rounded-lg disabled:opacity-50"
                        >
                          {loadingCoWriter ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PenTool className="w-3.5 h-3.5" />
                          )}
                          {t("notes.open_in_co_writer")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={startEditingRecord}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-lg"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {t("notes.edit_record")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedRecord ? (
          <>
            {/* Record Content */}
            <div ref={outputRef} className="flex-1 overflow-y-auto p-6 relative">
              {!isEditingRecord && (
                <SelectionSaveToolbar
                  containerRef={outputRef}
                  onSaveSelection={(html, text) => {
                    setSaveToNotesPayload({
                      title: text.slice(0, 80) || selectedRecord.title,
                      body: html,
                    });
                    setShowSaveToNotesModal(true);
                  }}
                />
              )}
              {isEditingRecord ? (
                <div className="space-y-6 max-w-4xl">
                  {recordEditDraft.user_query.trim() && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {t("User Query")}
                      </h3>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-800">
                        <textarea
                          value={recordEditDraft.user_query}
                          onChange={(e) =>
                            setRecordEditDraft((d) => ({
                              ...d,
                              user_query: e.target.value,
                            }))
                          }
                          rows={3}
                          className="w-full bg-transparent border-0 p-0 text-slate-700 dark:text-slate-200 text-sm leading-relaxed resize-y min-h-[48px] focus:outline-none focus:ring-0"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      {selectedRecord &&
                      recordUsesPlainOutputEdit(selectedRecord)
                        ? t("Chat")
                        : isHtmlDocument(recordEditDraft.outputHtml)
                          ? t("notes.lesson_content")
                          : t("Output")}
                    </h3>
                    {selectedRecord &&
                    recordUsesPlainOutputEdit(selectedRecord) ? (
                      <textarea
                        value={recordEditDraft.outputHtml}
                        onChange={(e) =>
                          setRecordEditDraft((d) => ({
                            ...d,
                            outputHtml: e.target.value,
                          }))
                        }
                        rows={14}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm leading-relaxed resize-y min-h-[280px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <div className="rounded-xl border border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 overflow-hidden min-h-[280px] flex flex-col">
                        <NotesEditor
                          contentHtml={recordEditDraft.outputHtml}
                          onChange={(html) =>
                            setRecordEditDraft((d) => ({
                              ...d,
                              outputHtml: html,
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              (() => {
                const chatMessages = getChatMessagesFromRecord(selectedRecord);
                const isChatRecord = selectedRecord.type === "chat";
                const showChatTranscript =
                  isChatRecord &&
                  (chatMessages?.length ||
                    selectedRecord.output.trim().length > 0);
                const showHtml = isHtmlDocument(selectedRecord.output);

                if (showChatTranscript) {
                  return (
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                        {t("Chat")}
                      </h3>
                      <NotebookRecordOutput
                        output={selectedRecord.output}
                        recordType={selectedRecord.type}
                        metadata={selectedRecord.metadata}
                      />
                    </div>
                  );
                }

                return (
                  <>
                    {!showHtml &&
                      !isChatRecord &&
                      selectedRecord.user_query.trim() && (
                      <div className="mb-6">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                          {t("User Query")}
                        </h3>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-800">
                          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                            {selectedRecord.user_query}
                          </p>
                        </div>
                      </div>
                    )}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {showHtml ? t("notes.lesson_content") : t("Output")}
                      </h3>
                      <NotebookRecordOutput
                        output={selectedRecord.output}
                        recordType={selectedRecord.type}
                        metadata={selectedRecord.metadata}
                      />
                    </div>
                  </>
                );
              })())}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
            <FileText className="w-16 h-16 text-slate-200 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {t("Select a record to view details")}
            </p>
          </div>
        )}
      </div>
      {rightCollapsed && (
        <button
          onClick={() => setRightCollapsed(false)}
          className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all self-start mt-4 shrink-0"
          title={t("Expand right panel")}
        >
          <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Create Notebook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[400px] animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                {t("Create New Notebook")}
              </h3>
              <ModalCloseButton onClick={() => setShowCreateModal(false)} absolute={false} />
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Name")}
                </label>
                <input
                  type="text"
                  value={newNotebook.name}
                  onChange={(e) =>
                    setNewNotebook((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder={t("My Notebook")}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Description (Optional)")}
                </label>
                <textarea
                  value={newNotebook.description}
                  onChange={(e) =>
                    setNewNotebook((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder={t("Notes about machine learning...")}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Color")}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() =>
                        setNewNotebook((prev) => ({ ...prev, color }))
                      }
                      className={`w-8 h-8 rounded-lg transition-all ${
                        newNotebook.color === color
                          ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 dark:ring-offset-slate-800 scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleCreateNotebook}
                disabled={!newNotebook.name.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t("Create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Notebook Modal */}
      {showEditModal && editingNotebook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[400px] animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                {t("Edit Notebook")}
              </h3>
              <ModalCloseButton
                onClick={() => {
                  setShowEditModal(false);
                  setEditingNotebook(null);
                }}
                absolute={false}
              />
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Name")}
                </label>
                <input
                  type="text"
                  value={editingNotebook.name}
                  onChange={(e) =>
                    setEditingNotebook((prev) =>
                      prev ? { ...prev, name: e.target.value } : null,
                    )
                  }
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Description")}
                </label>
                <textarea
                  value={editingNotebook.description}
                  onChange={(e) =>
                    setEditingNotebook((prev) =>
                      prev ? { ...prev, description: e.target.value } : null,
                    )
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t("Color")}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() =>
                        setEditingNotebook((prev) =>
                          prev ? { ...prev, color } : null,
                        )
                      }
                      className={`w-8 h-8 rounded-lg transition-all ${
                        editingNotebook.color === color
                          ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 dark:ring-offset-slate-800 scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingNotebook(null);
                }}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleUpdateNotebook}
                disabled={!editingNotebook.name.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t("Save Changes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[360px] animate-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t("Delete Notebook?")}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t(
                  "This action cannot be undone. All records in this notebook will be permanently deleted.",
                )}
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => handleDeleteNotebook(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveToNotesPayload && (
        <SaveToNotesModal
          isOpen={showSaveToNotesModal}
          onClose={() => {
            setShowSaveToNotesModal(false);
            setSaveToNotesPayload(null);
          }}
          title={saveToNotesPayload.title}
          body={saveToNotesPayload.body}
          asMarkdown={!saveToNotesPayload.body.trim().startsWith("<")}
        />
      )}
    </div>
  );
}
