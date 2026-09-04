import { ProjectChat } from "@/components/project-chat";

export default async function ChatPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectChat projectId={projectId} />;
}
