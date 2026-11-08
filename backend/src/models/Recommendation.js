import mongoose from "mongoose";

const profileSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  enabled: { type: Boolean, default: true },
  searches: [{ _id: false, term: String, at: Date }],
});
export const RecommendationProfile = mongoose.model("RecommendationProfile", profileSchema);

const snapshotSchema = new mongoose.Schema({
  _id: String,
  usuario: { type: mongoose.Schema.Types.ObjectId, index: true },
  books: [{ type: mongoose.Schema.Types.ObjectId, ref: "Livro" }],
  personalized: Boolean,
  expiresAt: { type: Date, expires: 0 },
});
export const RecommendationSnapshot = mongoose.model("RecommendationSnapshot", snapshotSchema);
