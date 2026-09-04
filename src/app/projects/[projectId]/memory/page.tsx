import { ProjectMemoryView } from "@/components/project-memory";
import { getProjectMemory, queryFromSearchParams } from "@/server/memory";

export default async function MemoryPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params, raw = await searchParams, queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach(item => queryParams.append(key, item));
    else if (value !== undefined) queryParams.append(key, value);
  }
  const query = queryFromSearchParams(queryParams);
  return <ProjectMemoryView projectId={projectId} memory={await getProjectMemory(projectId, query)} />;
}
