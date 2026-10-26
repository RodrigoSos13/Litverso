import { Router } from "express";
import {
  getReadings,
  upsertReading,
  getReadingById,
  updateReading,
  deleteReading,
} from "../controllers/readingController.js";

const router = Router();

router.get("/", getReadings);
router.post("/", upsertReading);
router.get("/:id", getReadingById);
router.patch("/:id", updateReading);
router.delete("/:id", deleteReading);

export default router;
