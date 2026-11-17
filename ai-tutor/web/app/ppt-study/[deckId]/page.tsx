import { notFound } from "next/navigation";
import PresentationChat from "./PresentationChat";

const deckIdPattern = /^cmc-ppt-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export default async function PresentationStudyPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  if (!deckIdPattern.test(deckId)) notFound();
  return <PresentationChat key={deckId} deckId={deckId} />;
}
