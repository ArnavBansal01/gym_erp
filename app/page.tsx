"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup 
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; 
import "./login_style.css"; 

export default function LoginPage() {
  const router = useRouter();
  
  // State
  const [formData, setFormData] = useState({ email: "", password: "", name: "", phone: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false); 

  // Handle text input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- HELPER: CHECK IF USER EXISTS ---
  // This function checks Firestore to see if we know this user yet
  const checkUserExists = async (uid: string) => {
    const userDocRef = doc(db, "users", uid);
    const userSnap = await getDoc(userDocRef);
    return userSnap.exists();
  };

  // --- LOGIC 1: EMAIL LOGIN ---
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const exists = await checkUserExists(user.uid);

      if (exists) {
        router.push("/dashboard");
      } else {
        // Prepare form with known data
        setFormData(prev => ({ ...prev, email: user.email || "" }));
        setIsNewUser(true);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Invalid email or password.");
      setIsLoading(false);
    }
  };

  // --- LOGIC 2: GOOGLE LOGIN ---
  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true); // Temporarily show loading state

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const exists = await checkUserExists(user.uid);

      if (exists) {
        router.push("/dashboard");
      } else {
        // Pre-fill name and email from Google
        setFormData(prev => ({ 
          ...prev, 
          email: user.email || "", 
          name: user.displayName || "" 
        }));
        setIsNewUser(true);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError("Google Sign-In failed.");
      setIsLoading(false);
    }
  };

  // --- LOGIC 3: SAVE PROFILE (Step 2) ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user found. Please login again.");

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        name: formData.name,   // Taken from form (or pre-filled by Google)
        phone: formData.phone, // Taken from form
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

        {/* --- SCREEN 1: LOGIN OPTIONS --- */}
        {!isNewUser && (
          <>
            <form onSubmit={handleEmailLogin} className="login-form">
              <div className="input-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <button type="submit" className="login-btn" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Sign In"}
              </button>
            </form>

            {/* DIVIDER */}
            <div className="divider">
              <span>OR</span>
            </div>

            {/* GOOGLE BUTTON */}
            <button 
              type="button" 
              className="google-btn" 
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              <img 
                src="https://www.svgrepo.com/show/475656/google-color.svg" 
                alt="Google Logo" 
              />
              Sign in with Google
            </button>

            <div className="login-footer">
              <p>Forgot Password? <a href="#">Reset here</a></p>
              <p>New Member? Contact Reception</p>
            </div>
          </>
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