import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./Components/Landing";
import AuthModal from "./Components/AuthModal";
import Prep from "./Components/Prep";
import Check from "./Components/Check";
import Interview from "./Components/Interview";

/** Blocks signed-out visitors from private pages. */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash" />; // waiting for the saved session
  if (!user) return <Navigate to="/" replace state={{ needsAuth: true }} />;
  return children;
}

function AppRoutes() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [modal, setModal] = useState({ open: false, mode: "signup" });

  const openAuth = (mode) => setModal({ open: true, mode });
  const closeAuth = () => setModal((m) => ({ ...m, open: false }));

  // Sent back from a private page while signed out: ask them to sign in
  useEffect(() => {
    if (location.state?.needsAuth) {
      openAuth("signin");
      navigate("/", { replace: true, state: null });
    }
  }, [location.state, navigate]);

  // Try / Get Started: signed-in users go straight in, new visitors sign up first
  const handleStart = () => (user ? navigate("/app") : openAuth("signup"));

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <Landing
              user={user}
              onSignIn={() => (user ? navigate("/app") : openAuth("signin"))}
              onGetStarted={handleStart}
              onLogout={signOut}
            />
          }
        />
        <Route path="/app" element={<ProtectedRoute><Prep /></ProtectedRoute>} />
        <Route path="/app/check/:id" element={<ProtectedRoute><Check /></ProtectedRoute>} />
        <Route path="/app/interview/:id" element={<ProtectedRoute><Interview /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <AuthModal
        open={modal.open}
        mode={modal.mode}
        onClose={closeAuth}
        onSuccess={() => { closeAuth(); navigate("/app"); }}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}