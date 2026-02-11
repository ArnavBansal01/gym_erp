"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase"; // Note the @ alias usually points to root
import { collection, getDocs } from "firebase/firestore";
export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
  const fetchPlans = async () => {
    try {
      // 1. Use 'collection' instead of 'ref'
      const querySnapshot = await getDocs(collection(db, "plans"));
      
      // 2. Map through the documents (Firestore doesn't use .val())
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log(data); // Update your state with this 'data'
    } catch (error) {
      console.error("Error fetching plans:", error);
    }
  };

  fetchPlans();
}, []);
  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-8">Choose Your Membership</h1>
      
      {plans.length === 0 ? (
        <p>Loading plans...</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white p-6 rounded-lg shadow-md border-t-4 border-green-500">
              <h2 className="text-2xl font-bold">{plan.tier}</h2>
              <p className="text-gray-500 my-2">{plan.desc}</p>
              <p className="text-4xl font-bold text-green-600 my-4">₹{plan.price}</p>
              <button
                onClick={() =>
                  router.push(
                    `/register?planId=${plan.id}&price=${plan.price}&name=${plan.tier}`
                  )
                }
                className="w-full bg-black text-white py-3 rounded hover:bg-gray-800 transition"
              >
                Buy Now
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}