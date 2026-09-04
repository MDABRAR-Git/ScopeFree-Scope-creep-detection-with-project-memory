import "server-only";

// Escape every project- or user-controlled string before placing it in HTML. The email carries no
// pricing, tasks or private notes: all proposal detail stays behind the secure portal link.
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
function expiryLabel(expiresAt: Date) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(expiresAt) + " UTC";
}

export function buildProposalEmail(input: { projectName: string; link: string; expiresAt: Date }) {
  const project = escapeHtml(input.projectName);
  const link = escapeHtml(input.link);
  const expiry = escapeHtml(expiryLabel(input.expiresAt));
  const subject = `Proposal to review for ${input.projectName}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
      <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6d28d9;margin:0 0 8px;font-weight:600;">ScopeFree</p>
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;">A proposal is ready to review for ${project}</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#3f3f46;">The freelancer has prepared a proposal for the requested change. Review the scope and estimated budget range in the secure portal, then accept or decline.</p>
      <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">Review proposal</a></p>
      <p style="font-size:13px;line-height:1.5;margin:0 0 6px;color:#52525b;">This link expires on ${expiry}.</p>
      <p style="font-size:13px;line-height:1.5;margin:0;color:#52525b;">Opening this link does not accept the proposal. You decide by explicitly choosing Accept or Decline in the portal. Please keep this link private.</p>
    </div>
    <p style="font-size:12px;color:#a1a1aa;text-align:center;margin:16px 0 0;">Sent by ScopeFree on the freelancer's behalf. This is not a request for payment.</p>
  </div></body></html>`;
  const text = [
    `A proposal is ready to review for ${input.projectName}.`,
    "",
    "The freelancer has prepared a proposal for the requested change. Review the scope and estimated budget range in the secure portal, then accept or decline.",
    "",
    `Review proposal: ${input.link}`,
    "",
    `This link expires on ${expiryLabel(input.expiresAt)}.`,
    "Opening this link does not accept the proposal. You decide by explicitly choosing Accept or Decline in the portal. Please keep this link private.",
    "",
    "Sent by ScopeFree on the freelancer's behalf. This is not a request for payment.",
  ].join("\n");
  return { subject, html, text };
}
