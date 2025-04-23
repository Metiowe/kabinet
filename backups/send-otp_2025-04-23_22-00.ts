import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { Client, Databases, ID } from "node-appwrite";

// ✅ Environment prüfen
const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  DB_ID,
  OTP_COLLECTION_ID,
  SMTP_USER,
  SMTP_PASS,
} = process.env;

if (
  !APPWRITE_ENDPOINT ||
  !APPWRITE_PROJECT_ID ||
  !APPWRITE_API_KEY ||
  !DB_ID ||
  !OTP_COLLECTION_ID ||
  !SMTP_USER ||
  !SMTP_PASS
) {
  throw new Error("❌ Fehlende ENV-Variablen – .env.local prüfen!");
}

// ✅ Appwrite Client
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT!)
  .setProject(APPWRITE_PROJECT_ID!)
  .setKey(APPWRITE_API_KEY!);

const databases = new Databases(client);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("✅ [send-otp] Handler ausgelöst");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "❌ Nur POST erlaubt" });
  }

  const { userId, email } = req.body;

  if (!userId || !email) {
    console.warn("⚠️ Fehlende Daten:", { userId, email });
    return res.status(400).json({ error: "❗ userId oder email fehlt" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 30 * 1000); // ⏰ 30 Sekunden Gültigkeit

  console.log("🔐 Generierter OTP:", otp);
  console.log("⏳ Gültig bis:", expiresAt.toISOString());

  try {
    // ✅ OTP in Appwrite speichern
    const doc = await databases.createDocument(
      DB_ID!,
      OTP_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        otp,
        expireAt: expiresAt.toISOString(),
      }
    );
    console.log("✅ OTP gespeichert:", doc.$id);

    // ✅ SMTP vorbereiten
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: {
        user: SMTP_USER!,
        pass: SMTP_PASS!,
      },
    });

    // ✅ Verbindung checken
    await transporter.verify();
    console.log("✅ SMTP-Verbindung erfolgreich");

    // 📤 E-Mail versenden
    const info = await transporter.sendMail({
      from: `"Leichtes Fahren" <support@leichtesfahren.pro>`,
      to: email,
      subject: "🔐 Dein Verifizierungscode",
      html: `
        <div style="font-family: sans-serif; padding: 24px;">
          <h2>Leichtes Fahren – Verifizierung</h2>
          <p>Gib diesen Code ein:</p>
          <h1 style="font-size: 32px;">${otp}</h1>
          <p>Der Code ist gültig bis: <strong>${expiresAt.toLocaleTimeString()}</strong></p>
          <p style="color: #888;">Dieser Code verfällt automatisch.</p>
        </div>
      `,
    });

    console.log("✅ Mail gesendet:", info.response);

    return res.status(200).json({
      success: true,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    console.error("❌ Fehler beim OTP-Versand:", err.message);
    return res.status(500).json({ error: "❌ Fehler beim OTP-Versand" });
  }
}
