import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/db.js";
import { User } from "../src/models/User.js";
const [username, role = "admin"] = process.argv.slice(2);
if (!username || !["admin", "user"].includes(role)) {
  console.error("Uso: npm run user:set-admin -- usuario [admin|user]");
  process.exit(1);
}
try {
  await connectDatabase();
  const user = await User.findOneAndUpdate({ usuario: username.replace(/^@/, "").toLowerCase() }, { $set: { role } }, { new: true });
  if (!user) throw new Error("Usuário não encontrado.");
  console.log(`@${user.usuario}: ${user.role}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
