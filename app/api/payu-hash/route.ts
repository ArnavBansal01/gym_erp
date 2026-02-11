import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { txnid, amount, productinfo, firstname, email } = await req.json();
    
    // Server-side environment variables
    const key = process.env.NEXT_PUBLIC_PAYU_KEY;
    const salt = process.env.PAYU_SALT;

    if (!key || !salt) {
      return NextResponse.json({ error: "PayU keys not configured" }, { status: 500 });
    }

    // Formula: sha512(key|txnid|amount|productinfo|firstname|email|||||||||||salt)
    const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
    
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    return NextResponse.json({ hash, txnid });
  } catch (error) {
    console.error("Hash Error:", error);
    return NextResponse.json({ error: "Hash generation failed" }, { status: 500 });
  }
}