import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="fade-in" style={{ textAlign: "center", marginTop: "4rem" }}>
      <h1 style={{ fontSize: "4rem" }}>404</h1>
      <p className="text-muted" style={{ fontSize: "1.1rem", marginBottom: "1.5rem" }}>
        You have wandered off the map, adventurer.
      </p>
      <button className="btn btn-primary" onClick={() => navigate("/")}>
        Return to Dashboard
      </button>
    </div>
  );
}
