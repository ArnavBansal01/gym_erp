"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase"; 
import { doc, getDoc, Timestamp } from "firebase/firestore"; // Added Timestamp import
import { onAuthStateChanged, signOut } from "firebase/auth";
import "../user_erp_style.css"; 

export default function UserPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "profile" | "messages">("dashboard");
  const [loading, setLoading] = useState(true);

  // --- 1. INITIAL STATE ---
  const [user, setUser] = useState({
    name: "Loading...",
    phone: "",
    plan: { 
      name: "Loading...", 
      price: "0", 
      daysLeft: 0 
    },
    attendance: { 
      attended: 0, 
      scheduled: 0, // Will be calculated below
      percentage: 0 
    },
    rating: 0,
    message: "Welcome to Iconic Gym!"
  });

  // --- 2. FETCH DATA & CALCULATE SESSIONS ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }

      try {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();

          // --- THE FIX: USE 'createdAt' ---
          let calculatedScheduled = 0;
          let joinDate: Date | null = null;

          if (data.createdAt) {
            // Check if it's a Firestore Timestamp (has .toDate())
            if (data.createdAt.toDate) {
              joinDate = data.createdAt.toDate(); 
            } 
            // Check if it's a string (e.g. ISO string)
            else if (typeof data.createdAt === 'string') {
               joinDate = new Date(data.createdAt);
            }
          }

          if (joinDate) {
            const today = new Date();
            
            // Calculate time difference in milliseconds
            const diffTime = Math.abs(today.getTime() - joinDate.getTime());
            
            // Convert to Days (Math.ceil ensures even the first day counts as 1)
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            // LOGIC: 2 Sessions per day
            calculatedScheduled = diffDays * 2;
          }
          // -----------------------

          setUser({
            name: data.name || "Member",
            phone: data.phone || currentUser.email,
            plan: data.plan || { name: "No Active Plan", price: "0", daysLeft: 0 },
            attendance: {
              attended: data.attendance?.attended || 0,
              scheduled: calculatedScheduled, // <--- The calculated value
              percentage: calculatePercentage(data.attendance?.attended || 0, calculatedScheduled)
            },
            rating: data.rating || 0,
            message: data.message || "No new announcements."
          });
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Helper: Logic for Attendance Color
  const getAttendanceColor = (pct: number) => {
    if (pct < 40) return "var(--danger-red)";
    if (pct < 60) return "var(--warning-yellow)";
    return "var(--dark-green)";
  };

  // Helper: Logic for Rating Color
  const getRatingColor = (score: number) => {
    if (score <= 5) {
      const g = Math.round((score / 5) * 255);
      return `rgb(255, ${g}, 0)`;
    } else {
      const r = Math.round(255 - ((score - 5) / 5) * 255);
      return `rgb(${r}, 255, 0)`;
    }
  };

  // Helper: Safe Percentage Calculation
  const calculatePercentage = (attended: number, scheduled: number) => {
    if (scheduled === 0) return 100;
    return Math.round((attended / scheduled) * 100);
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (loading) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1a1a2e', color: 'white'}}>
        Loading Dashboard...
      </div>
    );
  }

  return (
    <div className="erp-container">
      <nav className="nav-panel">
        <button 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          My Dashboard
        </button>
        <button 
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Personal Details
        </button>
        <button 
          className={`nav-item ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
        </button>
      </nav>

      <div className="content-wrapper" style={{flex: 1}}>
        <header className="header">
          <div className="brand">
            <img src="https://cdn-icons-png.flaticon.com/512/2964/2964514.png" alt="Logo" className="gym-logo" />
            <span className="gym-name">Iconic Gym Karnal</span>
          </div>
          <div className="header-actions">
            <button onClick={() => router.push('/attendance')}>
              Attendance
            </button>
            <button className="logout" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <main className="main-content">
          {activeTab === 'dashboard' && (
            <div className="fade-in">
              <div className="card">
                <div className="card-title">Current Active Plan</div>
                <div className="plan-name">{user.plan.name}</div>
                <div className="plan-details">
                  <span>Price: {user.plan.price}</span>
                  <span style={{color: 'var(--danger-red)', fontWeight: 'bold'}}>{user.plan.daysLeft} Days Left</span>
                </div>
                <div className="renewal-box">
                  <p style={{fontSize: '0.9rem', margin: '0 0 10px 0'}}>Gym membership expiring in {user.plan.daysLeft} days. Renew timely.</p>
                  <button className="renew-btn">Renew Now</button>
                </div>
              </div>

              <div className="card">
                <div className="card-title">My Attendance</div>
                <div className="attendance-stats">
                  <div className="stat-box">
                    <h4>{user.attendance.attended}</h4>
                    <p>Attended</p>
                  </div>
                  <div className="stat-box">
                    <h4>{user.attendance.scheduled}</h4>
                    <p>Scheduled</p>
                  </div>
                </div>
                <div className="percentage-display" style={{ color: getAttendanceColor(user.attendance.percentage) }}>
                  {user.attendance.percentage}% Consistency
                </div>
              </div>

              <div className="card">
                <div className="card-title">Performance Rating</div>
                <div className="rating-container">
                  <span className="rating-score" style={{ color: getRatingColor(user.rating) }}>{user.rating}</span>
                  <span className="rating-total"> / 10</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="card fade-in">
              <div className="card-title">Personal Details</div>
              <div className="profile-row">
                <span className="profile-label">Full Name</span>
                <span className="profile-value">{user.name}</span>
              </div>
              <div className="profile-row" style={{borderBottom: 'none'}}>
                <span className="profile-label">Phone/Email</span>
                <span className="profile-value">{user.phone}</span>
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="card fade-in" style={{borderLeftColor: 'var(--warning-yellow)'}}>
              <div className="card-title">Important Message</div>
              <p style={{lineHeight: '1.6', color: 'var(--text-dark)'}}>{user.message}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}