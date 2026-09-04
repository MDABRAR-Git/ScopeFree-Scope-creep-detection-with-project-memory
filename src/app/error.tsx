"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="standalone-message"><h1>We couldn’t open this page.</h1><p>Your work hasn’t been changed. Check the workspace configuration and database connection, then try again.</p><button className="button button-primary" onClick={reset}>Try again</button><Link className="back-link" href="/login">Back to login</Link></main>; }
