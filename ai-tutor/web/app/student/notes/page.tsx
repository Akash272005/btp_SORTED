import { redirect } from "next/navigation";

/** Legacy URL — personal notes live in notebooks */
export default function StudentNotesRedirectPage() {
  redirect("/notebook");
}
