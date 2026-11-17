import { redirect } from "next/navigation";

/** Legacy URL — study materials live at /knowledge */
export default function StudentMaterialsRedirectPage() {
  redirect("/knowledge");
}
