import { createContext, useContext, useEffect, useState } from "react";
import * as auth from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until the saved session is checked

  useEffect(() => {
    return auth.onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = {
    user,
    loading,
    signUp: auth.signUp,
    signIn: auth.signIn,
    signInWithGoogle: auth.signInWithGoogle,
    signOut: auth.signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);