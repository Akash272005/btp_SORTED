import AvatarLearning from "@/app/components/avatar-learning/AvatarLearning"

export default async function StudentPptLearningPage({ params }: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return <AvatarLearning backHref={`/student/${encodeURIComponent(username)}/home`} />
}
