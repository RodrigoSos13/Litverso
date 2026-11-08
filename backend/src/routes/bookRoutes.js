import { Router } from "express";
import {
  createBook,
  getBookById,
  getBooks,
  getCatalog,
  getGenres,
} from "../controllers/bookController.js";

import { importGoogleBook, searchGoogleBooks } from "../controllers/googleBooksController.js";
import { getRecommendationPreferences, updateRecommendationPreferences } from "../controllers/recommendationController.js";
const router = Router();
const requests = new Map();
function limitGoogleBooks(req, res, next) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const key = String(req.user._id);
  const entry = requests.get(key) || { count: 0, until: now + 60000 };
  entry.count++;
  requests.set(key, entry);
  if (entry.count > 60) return res.status(429).json({ message: "Você fez muitas consultas. Aguarde um minuto e tente novamente." });
  next();
}
router.get("/google/search", limitGoogleBooks, searchGoogleBooks);
router.get("/google/discover", limitGoogleBooks, searchGoogleBooks);
router.post("/google/import", limitGoogleBooks, importGoogleBook);
router.get("/interests", getRecommendationPreferences);
router.post("/interests", updateRecommendationPreferences);
router.put("/interests", updateRecommendationPreferences);
router.delete("/interests", updateRecommendationPreferences);

router.get("/genres", getGenres);
router.get("/catalog", getCatalog);
router.get("/", getBooks);
router.post("/", createBook);
router.get("/:id", getBookById);

export default router;
