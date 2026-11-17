import { apiUrl } from "@/lib/api";
import type { ChatMessageAttachment } from "@/types/chat";

export async function uploadChatAttachment(
  file: File,
): Promise<ChatMessageAttachment> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(apiUrl("/api/v1/chat/upload-attachment"), {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Upload failed",
    );
  }

  return {
    url: data.url as string,
    name: (data.filename as string) || file.name,
    kind: (data.kind as ChatMessageAttachment["kind"]) || "document",
  };
}
