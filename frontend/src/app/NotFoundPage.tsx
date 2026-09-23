import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="gate">
      <h1>Page not found</h1>
      <p>There is no page at this address.</p>
      <Link to="/">Back to lineup</Link>
    </section>
  );
}
