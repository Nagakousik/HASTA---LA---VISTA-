import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSession } from "../services/dataService";
import "./Landing.css";
import "./Dashboard.css";

// Placeholder for step 3: the live interview room.
export default function Interview() {
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

  return (
    <div className="page">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <div className="dash">
        <div className="dash-card glass">
          <h1>You&rsquo;re in the lobby.</h1>
          <p>{session.company} &middot; {session.role} &middot; {session.minutes} minutes. The live interview room comes next.</p>
          <div className="dash-actions">
            <button className="btn btn-ghost" onClick={() => navigate(`/app/check/${id}`)}>Back to setup</button>
          </div>
        </div>
      </div>
    </div>
  );
}