import { useNavigate } from "react-router-dom";

import Flourish from "../components/Flourish";

/**
 * 404 — you wandered into the mist (Plan 00029 polish).
 *
 * Themed, centered, and animated. Offers a single way home.
 */
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="ql-modal-in"
      style={{
        maxWidth: 560,
        margin: "8vh auto",
        padding: "2rem",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px solid var(--gold)",
        borderRadius: 12,
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(201, 168, 76, 0.08)",
      }}
    >
      <img
        src="/d20.svg"
        alt=""
        aria-hidden
        style={{
          width: 64,
          height: 64,
          opacity: 0.7,
          animation: "ql-shake 1.6s ease-in-out infinite",
        }}
      />
      <h1
        style={{
          fontSize: "3rem",
          margin: "0.5rem 0 0",
          color: "var(--gold)",
          fontFamily: "Cinzel Decorative, serif",
          letterSpacing: "0.1em",
        }}
      >
        404
      </h1>
      <Flourish width={180} />
      <p
        style={{
          fontStyle: "italic",
          color: "var(--muted)",
          fontSize: "1.05rem",
          margin: "0.5rem 0 1.4rem",
        }}
      >
        The path you sought lies beyond the map's edge.<br />
        Mist swallows it, and stars give no light here.
      </p>
      <button
        className="btn btn-primary"
        onClick={() => navigate("/")}
        style={{ fontSize: "0.95rem" }}
      >
        ↩ Return to the keep
      </button>
    </div>
  );
}
