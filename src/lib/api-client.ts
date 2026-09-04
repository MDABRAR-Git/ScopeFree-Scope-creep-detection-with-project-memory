import type { ApiErrorBody } from "./contracts";
export class ClientApiError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
export async function readApiResponse(response: Response) {
  let result;
  try { result = await response.json(); } catch { throw new ClientApiError("The server could not return a response. Your input is still here; please try again."); }
  if (!response.ok) {
    const error = (result as ApiErrorBody).error;
    throw new ClientApiError(Object.values(error?.fields ?? {}).flat()[0] ?? error?.message ?? "Something went wrong. Please try again.", error?.code);
  }
  return result;
}
