import { RequestIntake } from "@/components/request-intake";
import { requirePageSession } from "@/server/auth";
import { getBaseline, listRequests } from "@/server/intake";
export default async function RequestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  const [baseline, requests] = await Promise.all([getBaseline(projectId), listRequests(projectId)]);
  return <RequestIntake key={projectId} projectId={projectId} hasBaseline={!!baseline} initialRequests={requests} />;
}
