import { redirect } from "next/navigation";

// The middleware redirects "/" for both authenticated and unauthenticated
// users; this is a server-side fallback so the route always resolves.
export default function Home() {
  redirect("/dashboard");
}
