import AvatarLearning from "@/app/components/avatar-learning/AvatarLearning"

export default async function EducatorPptLearningPage({ params }: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return <AvatarLearning backHref={`/educator/${encodeURIComponent(username)}`} />
}
