import { Router } from "express";
import {
  createComment,
  deleteComment,
  getComments,
  updateCommentLike,
} from "../controllers/commentController.js";

const router = Router();

router.get("/", getComments);
router.post("/", createComment);
router.delete("/:id", deleteComment);
router.put("/:id/like", updateCommentLike);
router.delete("/:id/like", updateCommentLike);

export default router;
