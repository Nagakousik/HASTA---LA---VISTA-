import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSession } from "../services/dataService";
import { personaById } from "../data/personas";
import "./Interview.css";

export default function Results() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let off = false;
    getSession(user.uid, id).then((s) => !off && setSession(s)).catch(() => !off && setSession(null));
    return () => { off = true; };
  }, [id, user.uid]);

  if (session === undefined) return <div className="splash" />;
  if (!session) return <Navigate to="/app" replace />;
  if (session.status === "setup" || session.status === "live") {
    return <Navigate to={`/app/interview/${id}`} replace />;
  }

  const persona = personaById(session.personaId);
  const candidateName = session.candidateName || user?.name || "Candidate";
  const turns = session.transcript || [];
  const answers = turns.filter((t) => t.role === "user" && t.text !== "[no answer]").length;

  return (
    <div className="page room">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <div className="results-container">
        <header className="results-header">
          <h1>Interview Complete</h1>
          <p className="results-meta">
            <span>Candidate: <b>{candidateName}</b></span>
            <span>{session.company} &middot; {session.role}</span>
            <span>{session.minutes} minutes</span>
            {persona && <span>with {persona.name}, {persona.title}</span>}
          </p>
        </header>

        <section className="results-summary" aria-label="Interview summary">
          <div className="summary-stats">
            <div className="stat">
              <span className="stat-value">{answers}</span>
              <span className="stat-label">Answers Given</span>
            </div>
            <div className="stat">
              <span className="stat-value">{turns.filter(t => t.role === "ai").length}</span>
              <span className="stat-label">Questions Asked</span>
            </div>
            <div className="stat">
              <span className="stat-value">{session.endReason === "time" ? "Time Expired" : session.endReason === "no_response" ? "Non-Response" : session.endReason || "Completed"}</span>
              <span className="stat-label">End Reason</span>
            </div>
          </div>
        </section>

        <section className="results-transcript-section" aria-label="Conversation transcript">
          <h2>Conversation Transcript</h2>
          <ul className="transcript">
            {turns.length === 0 && (
              <li className="empty">No conversation recorded.</li>
            )}
            {turns.map((t, i) => (
              <li key={i} className={`bub ${t.role}`}>
                <small>{t.role === "ai" ? persona?.name || "Recruiter" : candidateName}</small>
                {t.text === "[no answer]" ? <em>No answer</em> : t.text}
              </li>
            ))}
          </ul>
        </section>

        <div className="dash-actions">
          <button className="btn btn-primary" onClick={() => navigate("/app")}>Practise Again</button>
        </div>
      </div>
    </div>
  );
}