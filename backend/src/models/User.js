import mongoose from "mongoose";
import { protectedEmail } from "../auth/emailPrivacy.js";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "admin"], default: "user" },
    notificationsReadAt: { type: Date, select: false },
    passwordHash: { type: String, select: false },
    emailVerifiedAt: { type: Date, select: false },
    authVersion: { type: Number, default: 0, select: false },
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    usuario: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    emailEncrypted: { type: String, required: true, select: false },
    emailHash: { type: String, required: true, unique: true, sparse: true, select: false },
    biografia: {
      type: String,
      default: "",
      maxlength: 280,
    },
    urlAvatar: {
      type: String,
      default: "",
    },
    totalSeguidores: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSeguindo: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Input-only virtual: plaintext is never persisted or included in JSON.
userSchema.virtual("email").set(function (email) {
  this.set(protectedEmail(email));
});

export const User = mongoose.model("Usuario", userSchema, "usuarios");
