import Link from "next/link";
export default function NotFound() { return <div className="standalone-message"><h1>Project not found.</h1><p>Check the link or return to your project list.</p><Link className="button button-primary" href="/projects">All projects</Link></div>; }
