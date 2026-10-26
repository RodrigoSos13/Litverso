import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import userRoutes from "./routes/userRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";
import readingRoutes from "./routes/readingRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import likeRoutes from "./routes/likeRoutes.js";

import authRoutes from "./auth/routes.js";
import { requireAuth } from "./auth/session.js";
import { getNotifications, readNotifications, readNotification } from "./controllers/notificationController.js";
const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && req.headers.origin !== frontendOrigin) return res.status(403).json({ message: "Origem não autorizada." });
  next();
});
app.use("/api/posts", express.json({ limit: "15mb" }));
app.use("/api/books", express.json({ limit: "8mb" }));
app.use("/api/users", express.json({ limit: "512kb" }));
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ message: "litverso API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const isFollow = ["PUT", "DELETE"].includes(req.method) && /^\/users\/[a-fA-F0-9]{24}\/follow$/.test(req.path);
    if (req.path.startsWith("/users") && !isFollow && (req.method !== "PUT" || req.path !== `/users/${req.user._id}`)) return res.status(403).json({ message: "Você só pode editar sua própria conta." });
    if (req.method === "DELETE" && req.path.startsWith("/likes/") && req.path.split("/")[3] !== String(req.user._id)) return res.status(403).json({ message: "Você só pode remover suas próprias curtidas." });
    const resource = req.path.split("/")[1];
    const allowedFields = {
      posts: ["livro", "tipo", "texto", "urlImagem", "imagens", ...(req.method === "PATCH" ? ["fixadoNoPerfil"] : [])],
      comments: ["publicacao", "texto"],
      likes: ["publicacao"],
      readings: ["livro", "status", "nota"],
      users: ["nome", "biografia", "urlAvatar"],
      books: ["titulo", "autor", "genero", "descricao", "urlCapa", "destaque", "totalPaginas", "editora", "anoPublicacao", "idioma", "isbn", "googleBooksId"],
    }[resource] || [];
    req.body = Object.fromEntries(allowedFields.filter(key => req.body?.[key] !== undefined).map(key => [key, req.body[key]]));
    req.body.usuario = req.user._id;
  }
  next();
});
app.get("/api/notifications", getNotifications);
app.patch("/api/notifications/read", readNotifications);
app.patch("/api/notifications/:id/read", readNotification);
app.use("/api/users", userRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/likes", likeRoutes);

// Render runs the API and the compiled React app on the same origin.
// Opt in explicitly so the separate frontend container keeps working.
if (process.env.SERVE_FRONTEND === "true") {
  const frontendPath = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  const indexPath = fileURLToPath(new URL("../../frontend/dist/index.html", import.meta.url));
  if (!existsSync(indexPath)) throw new Error("Frontend ausente. Execute o build de frontend antes de iniciar com SERVE_FRONTEND=true.");

  app.use("/api", (_req, res) => res.status(404).json({ message: "Rota não encontrada." }));
  app.use(express.static(frontendPath, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/assets/")) return next();
    res.set("Cache-Control", "no-cache");
    res.sendFile(indexPath);
  });
}

export default app;
