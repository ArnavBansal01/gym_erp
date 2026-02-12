"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  GoogleAuthProvider, 
  signInWithPopup 
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  serverTimestamp 
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; 
import "./login_style.css"; 

export default function LoginPage() {
  const router = useRouter();
  
  // State
  const [formData, setFormData] = useState({ 
    email: "", 
    password: "", 
    name: "", 
    phone: "",
    assignedTrainer: null as any 
  });
  const [trainers, setTrainers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false); 

  // --- LOGIC: FETCH TRAINERS ---
  useEffect(() => {
    if (isNewUser) {
      const fetchTrainers = async () => {
        try {
          const querySnapshot = await getDocs(collection(db, "trainers"));
          const trainersList = querySnapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
          }));
          setTrainers(trainersList);
        } catch (err) {
          console.error("Error fetching trainers:", err);
          setError("Could not load trainers list.");
        }
      };
      fetchTrainers();
    }
  }, [isNewUser]);

  // Handle text input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle Trainer dropdown selection
  const handleTrainerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedTrainer = trainers.find(t => t.uid === e.target.value);
    setFormData({ ...formData, assignedTrainer: selectedTrainer || null });
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

  // --- LOGIC: SAVE PROFILE ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.assignedTrainer) {
      setError("Please select a trainer.");
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user found. Please login again.");

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        name: formData.name,   
        phone: formData.phone, 
        createdAt: serverTimestamp(),
        role: "member",
        assignedTrainer: {
          uid: formData.assignedTrainer.uid,
          name: formData.assignedTrainer.name,
          email: formData.assignedTrainer.email
        }
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

        {/* --- SCREEN 1: GOOGLE LOGIN --- */}
        {!isNewUser && (
          <div style={{ padding: "20px 0" }}>
            <button 
              type="button" 
              className="google-btn" 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              style={{ width: "100%" }}
            >
              <img 
                src="https://www.svgrepo.com/show/475656/google-color.svg" 
                alt="Google Logo" 
              />
              {isLoading ? "Connecting..." : "Sign in with Google"}
            </button>
          </div>
        )}

        {/* --- SCREEN 2: ONBOARDING --- */}
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

            {/* TRAINER DROPDOWN */}
            <div className="input-group">
              <label>Choose Your Trainer</label>
              <select 
                name="trainer" 
                required 
                onChange={handleTrainerChange}
                className="trainer-select"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  marginTop: '5px',
                  fontSize: '1rem'
                }}
              >
                <option value="">Select a Trainer</option>
                {trainers.map((trainer) => (
                  <option key={trainer.uid} value={trainer.uid}>
                    {trainer.name}
                  </option>
                ))}
              </select>
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