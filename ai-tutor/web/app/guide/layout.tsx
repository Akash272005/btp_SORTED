/**
 * Keeps Guided Learning within the viewport: scroll lives inside lesson / assistant
 * columns instead of growing <main> with empty trailing space.
 */
export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-h-0 max-h-full overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
