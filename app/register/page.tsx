"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { ref, set } from "firebase/database";

// Ensure global window type for ReCaptcha
declare global {
  interface Window {
    recaptchaVerifier: any;
    confirmationResult: any;
  }
}

// 1. Create a sub-component for the logic that uses search params
function RegisterForm() {
  const searchParams = useSearchParams();
  
  // Safe check for params
  const planDetails = {
    id: searchParams.get("planId"),
    price: searchParams.get("price"),
    name: searchParams.get("name"),
  };

  const [step, setStep] = useState(1); // 1=Phone, 2=OTP, 3=Details, 4=Payment
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({ fullName: "", email: "" });
  const [payuHash, setPayuHash] = useState("");
  const [txnid, setTxnid] = useState("");

  // --- STEP 1: SETUP RECAPTCHA ---
  useEffect(() => {
    // Only init if window is available
    if (typeof window !== "undefined" && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
  }, []);

  // --- ACTION: SEND OTP ---
  const sendOtp = async () => {
    if (phone.length < 10) return alert("Invalid Phone");
    try {
      const formattedPhone = phone.startsWith("+91") ? phone : `+91${phone}`;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      window.confirmationResult = confirmation;
      setStep(2);
    } catch (error) {
      console.error(error);
      alert("Error sending OTP. Use test number 9999999999 for dev.");
    }
  };

  // --- ACTION: VERIFY OTP ---
  const verifyOtp = async () => {
    try {
      const result = await window.confirmationResult.confirm(otp);
      setUser(result.user);
      setStep(3); // Go to details form
    } catch (error) {
      alert("Invalid OTP");
    }
  };

  // --- ACTION: SAVE DATA & PREPARE PAYMENT ---
  const initiatePayment = async () => {
    if (!user) return;

    // 1. Generate Transaction ID
    const newTxnid = "txn_" + new Date().getTime();
    setTxnid(newTxnid);

    // 2. Save User to Firebase (Pending Status)
    await set(ref(db, `users/${user.uid}`), {
      name: formData.fullName,
      email: formData.email,
      phone: user.phoneNumber,
      plan_id: planDetails.id,
      payment_status: "pending",
      role: "member"
    });

    // 3. Get PayU Hash from our API
    try {
      const response = await fetch("/api/payu-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txnid: newTxnid,
          amount: planDetails.price,
          productinfo: planDetails.name,
          firstname: formData.fullName,
          email: formData.email,
        }),
      });
      const data = await response.json();
      
      if (data.error) {
        alert("Payment Error: " + data.error);
        return;
      }

      setPayuHash(data.hash);
      setStep(4);
    } catch (err) {
      console.error(err);
      alert("Failed to initiate payment");
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
      <h2 className="text-xl font-bold mb-4">Complete Registration</h2>
      
      {planDetails.name ? (
        <div className="mb-4 p-3 bg-green-50 text-green-800 rounded">
          Selected: {planDetails.name} (₹{planDetails.price})
        </div>
      ) : (
        <div className="mb-4 p-3 bg-red-50 text-red-800 rounded">
          No plan selected. Please go back to Plans page.
        </div>
      )}

      {/* STEP 1: PHONE INPUT */}
      {step === 1 && (
        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            placeholder="9999999999"
          />
          <button onClick={sendOtp} className="w-full bg-blue-600 text-white py-2 rounded">
            Send OTP
          </button>
          <div id="recaptcha-container"></div>
        </div>
      )}

      {/* STEP 2: OTP INPUT */}
      {step === 2 && (
        <div>
          <label className="block text-sm font-medium mb-1">Enter OTP</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          />
          <button onClick={verifyOtp} className="w-full bg-blue-600 text-white py-2 rounded">
            Verify OTP
          </button>
        </div>
      )}

      {/* STEP 3: USER DETAILS */}
      {step === 3 && (
        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <input
            type="text"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            className="w-full p-2 border rounded mb-4"
          />
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full p-2 border rounded mb-4"
          />
          <button onClick={initiatePayment} className="w-full bg-green-600 text-white py-2 rounded">
            Proceed to Payment
          </button>
        </div>
      )}

      {/* STEP 4: PAYU HIDDEN FORM (Auto Submits) */}
{step === 4 && payuHash && (
  <div className="text-center">
    <p>Redirecting to PayU...</p>
    <form action="https://secure.payu.in/_payment" method="POST" id="payuForm">
      <input type="hidden" name="key" value={process.env.NEXT_PUBLIC_PAYU_KEY} />
      <input type="hidden" name="txnid" value={txnid} />
      <input type="hidden" name="productinfo" value={planDetails.name || "Gym Plan"} />
      <input type="hidden" name="amount" value={planDetails.price || "0"} />
      <input type="hidden" name="email" value={formData.email} />
      <input type="hidden" name="firstname" value={formData.fullName} />
      <input type="hidden" name="phone" value={user?.phoneNumber?.replace("+91", "")} />
      <input type="hidden" name="surl" value="http://localhost:3000/success" />
      <input type="hidden" name="furl" value="http://localhost:3000/failed" />
      <input type="hidden" name="hash" value={payuHash} />
      <button type="submit" className="mt-4 bg-black text-white px-4 py-2 rounded">
        Click here if not redirected
      </button>
    </form>
    <script dangerouslySetInnerHTML={{ __html: `document.getElementById("payuForm").submit();` }} />
  </div>
)}
    </div>
  );
}

// 2. Main Page Component with Suspense Boundary
export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <Suspense fallback={<div className="text-center p-4">Loading Registration...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}