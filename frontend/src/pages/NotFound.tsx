import { useNavigate } from "react-router-dom";
import { Compass, House } from "lucide-react";

/**
 * 404 — you wandered off the map (Plan 00029, restyled for Lamplit in Plan 121).
 *
 * A plain panel: what happened in tool words, one line of story flavour,
 * and a single way home.
 */
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="ql-modal-in"
      style={{
        maxWidth: 520,
        margin: "8vh auto",
        padding: "2rem 1.5rem",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <Compass size={40} aria-hidden style={{ color: "var(--muted)" }} />
      <h1 style={{ fontSize: "1.45rem", margin: "0.75rem 0 0.25rem" }}>Page not found</h1>
      <p className="text-muted" style={{ margin: "0 0 1rem", fontSize: "0.9375rem" }}>
        This link doesn&rsquo;t lead anywhere in QuestLab (error <span className="num">404</span>).
      </p>
      <p
        className="story"
        style={{
          fontStyle: "italic",
          color: "var(--story-text)",
          fontSize: "1.1rem",
          lineHeight: 1.5,
          margin: "0 0 1.4rem",
        }}
      >
        The path you sought lies beyond the map&rsquo;s edge.
        <br />
        Mist swallows it, and stars give no light here.
      </p>
      <button className="btn btn-primary" onClick={() => navigate("/")}>
        <House size={16} aria-hidden /> Back to the dashboard
      </button>
    </div>
  );
}
