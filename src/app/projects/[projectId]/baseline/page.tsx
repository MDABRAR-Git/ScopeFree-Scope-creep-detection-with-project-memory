import { BaselineEditor } from "@/components/baseline-editor";
import { requirePageSession } from "@/server/auth";
import { getBaseline } from "@/server/intake";
export default async function BaselinePage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  return <BaselineEditor key={projectId} projectId={projectId} initialBaseline={await getBaseline(projectId)} />;
}
