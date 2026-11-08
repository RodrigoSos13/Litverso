import { RecommendationProfile, RecommendationSnapshot } from "../models/Recommendation.js";
import { searchText } from "../services/bookSearch.js";

export async function getRecommendationPreferences(req, res) {
  try {
    const profile = await RecommendationProfile.findById(req.user._id).lean();
    res.json({ enabled: profile?.enabled !== false });
  } catch { res.status(503).json({ message: "Não foi possível carregar suas preferências." }); }
}

export async function updateRecommendationPreferences(req, res) {
  try {
    const id = req.user._id;
    if (req.method === "POST") {
      if (typeof req.body.search !== "string" || req.body.search.length > 200 || searchText(req.body.search).length < 3) return res.status(400).json({ message: "Informe uma pesquisa de 3 a 200 caracteres." });
      const term = req.body.search.trim();
      // Only the account owner can write; a disabled profile cannot collect searches.
      await RecommendationProfile.updateOne({ _id: id }, { $setOnInsert: { enabled: true, searches: [] } }, { upsert: true });
      await RecommendationProfile.updateOne({ _id: id, enabled: true }, { $pull: { searches: { term } } });
      await RecommendationProfile.updateOne({ _id: id, enabled: true }, { $push: { searches: { $each: [{ term, at: new Date() }], $slice: -20 } } });
    } else {
      if (req.method === "PUT" && typeof req.body.enabled !== "boolean") return res.status(400).json({ message: "Informe uma preferência válida." });
      await RecommendationProfile.updateOne({ _id: id }, { $set: { searches: [], ...(req.method === "PUT" ? { enabled: req.body.enabled } : {}) } }, { upsert: true });
      await RecommendationSnapshot.deleteMany({ usuario: id });
    }
    res.json({ ok: true });
  } catch { res.status(503).json({ message: "Não foi possível salvar suas preferências." }); }
}
