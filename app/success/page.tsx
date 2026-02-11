"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Ideally, you verify the Payment Hash from PayU again here securely.
    // For this prototype, we assume success.
    
    setTimeout(() => {
       // Redirect to Dashboard
       router.push("/dashboard"); 
    }, 3000);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-green-600">Payment Successful!</h1>
        <p className="mt-4 text-gray-600">Your membership is now active.</p>
        <p className="text-sm text-gray-400 mt-2">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}