"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  GoogleAuthProvider, 
  signInWithPopup 
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; 
import "./login_style.css"; 

export default function LoginPage() {
  const router = useRouter();
  
  // State
  // Kept structure same to avoid breaking change handlers, though password is now unused
  const [formData, setFormData] = useState({ email: "", password: "", name: "", phone: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false); 

  // Handle text input changes (For the onboarding name/phone form)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- HELPER: CHECK IF USER EXISTS ---
  const checkUserExists = async (uid: string) => {
    const userDocRef = doc(db, "users", uid);
    const userSnap = await getDoc(userDocRef);
    return userSnap.exists();
  };

  // --- LOGIC: GOOGLE LOGIN ---
  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true); 

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const exists = await checkUserExists(user.uid);

      if (exists) {
        router.push("/dashboard");
      } else {
        // Pre-fill name and email from Google for the next step
        setFormData(prev => ({ 
          ...prev, 
          email: user.email || "", 
          name: user.displayName || "" 
        }));
        setIsNewUser(true); // Switch to onboarding screen
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError("Google Sign-In failed.");
      setIsLoading(false);
    }
  };

  // --- LOGIC: SAVE PROFILE (Step 2 - Unchanged) ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user found. Please login again.");

      // Database logic remains exactly the same
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        name: formData.name,   
        phone: formData.phone, 
        createdAt: serverTimestamp(),
        role: "member"
      });

      router.push("/dashboard");

    } catch (err: any) {
      setError("Error saving profile: " + err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        {/* LOGO SECTION */}
        <div className="login-header">
          <img 
            src="https://cdn-icons-png.flaticon.com/512/2964/2964514.png" 
            alt="Iconic Gym Logo" 
            className="login-logo"
          />
          <h1>Iconic Gym</h1>
          <p>{isNewUser ? "One Last Step..." : "Member Portal"}</p>
        </div>

        {error && <div className="error-message" style={{color: 'red', textAlign: 'center', marginBottom:'1rem'}}>{error}</div>}

        {/* --- SCREEN 1: GOOGLE LOGIN ONLY --- */}
        {!isNewUser && (
          <div style={{ padding: "20px 0" }}> {/* Added minimal padding for spacing */}
            <button 
              type="button" 
              className="google-btn" 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              style={{ width: "100%" }} // Ensure it stays full width
            >
              <img 
                src="https://www.svgrepo.com/show/475656/google-color.svg" 
                alt="Google Logo" 
              />
              {isLoading ? "Connecting..." : "Sign in with Google"}
            </button>
          </div>
        )}

        {/* --- SCREEN 2: ONBOARDING (Name/Phone) --- */}
        {isNewUser && (
          <form onSubmit={handleSaveProfile} className="login-form">
            <div className="input-group">
              <label>Full Name</label>
              <input
                type="text"
                name="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="input-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phone"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? "Saving..." : "Complete Setup"}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}