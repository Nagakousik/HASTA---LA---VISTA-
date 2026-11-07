import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Landing.css";
import "./Dashboard.css";

// Placeholder for the protected area. The interview setup form and the
// live hot seat will replace this content in the next step.
export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // FIRESTORE (later): load this user's past sessions and scores here
  // const snap = await getDocs(collection(db, "users", user.uid, "sessions"));

  return (
    <div className="page">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <div className="dash">
        <div className="dash-card glass">
          <h1>Hi {user.name ? user.name.split(" ")[0] : "there"}, you're in.</h1>
          <p>Your account is ready. The interview setup form goes here next.</p>
          <div className="dash-actions">
            <button className="btn btn-primary" onClick={() => navigate("/")}>Back to home</button>
            <button className="btn btn-ghost" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </div>
    </div>
  );
}