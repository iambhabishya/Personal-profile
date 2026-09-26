import crypto from "node:crypto";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const dataDirectory = path.join(__dirname, "data");
const uploadDirectory = path.join(__dirname, "uploads", "wallpapers");
const wallpaperDataPath = path.join(dataDirectory, "wallpapers.json");

if (!adminPassword || !sessionSecret || sessionSecret.length < 32) {
  throw new Error("Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters before starting the server.");
}

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });
if (!fs.existsSync(wallpaperDataPath)) fs.writeFileSync(wallpaperDataPath, "[]", "utf8");

const app = express();
const sessions = new Map();
const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(express.static(__dirname, { index: "index.html", extensions: ["html"] }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { fallthrough: false }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

function readWallpapers() {
  try {
    return JSON.parse(fs.readFileSync(wallpaperDataPath, "utf8"));
  } catch {
    return [];
  }
}

function writeWallpapers(wallpapers) {
  const temporaryPath = `${wallpaperDataPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(wallpapers, null, 2), "utf8");
  fs.renameSync(temporaryPath, wallpaperDataPath);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return token;
}

function requireAdmin(request, response, next) {
  const token = request.cookies.admin_session;
  const expiresAt = sessions.get(token);
  if (!token || !expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return response.status(401).json({ error: "Admin authentication required." });
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (request, file, callback) => callback(null, `${crypto.randomUUID()}${allowedMimeTypes.get(file.mimetype) || ".bin"}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (request, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype))
});

app.get("/api/wallpapers", (request, response) => {
  response.json(readWallpapers());
});

app.post("/api/auth/login", loginLimiter, (request, response) => {
  const { username, password } = request.body || {};
  if (!safeEqual(username, adminUsername) || !safeEqual(password, adminPassword)) {
    return response.status(401).json({ error: "Invalid admin credentials." });
  }
  const token = createSession();
  response.cookie("admin_session", token, { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 8 * 60 * 60 * 1000 });
  response.json({ authenticated: true });
});

app.post("/api/auth/logout", (request, response) => {
  sessions.delete(request.cookies.admin_session);
  response.clearCookie("admin_session");
  response.status(204).end();
});

app.get("/api/auth/me", requireAdmin, (request, response) => response.json({ authenticated: true }));

app.post("/api/wallpapers", requireAdmin, uploadLimiter, upload.single("wallpaper"), (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Choose a JPG, PNG or WEBP image under 8 MB." });
  const wallpaper = {
    id: path.parse(request.file.filename).name,
    name: request.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120),
    url: `/uploads/wallpapers/${request.file.filename}`,
    createdAt: new Date().toISOString()
  };
  writeWallpapers([wallpaper, ...readWallpapers()]);
  response.status(201).json(wallpaper);
});

app.delete("/api/wallpapers/:id", requireAdmin, (request, response) => {
  const wallpapers = readWallpapers();
  const wallpaper = wallpapers.find(item => item.id === request.params.id);
  if (!wallpaper) return response.status(404).json({ error: "Wallpaper not found." });
  const filename = path.basename(wallpaper.url);
  const filePath = path.join(uploadDirectory, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  writeWallpapers(wallpapers.filter(item => item.id !== wallpaper.id));
  response.status(204).end();
});

app.use((error, request, response, next) => {
  if (error instanceof multer.MulterError || error.message?.includes("File too large")) {
    return response.status(400).json({ error: "Upload rejected. Use a JPG, PNG or WEBP image under 8 MB." });
  }
  next(error);
});

app.listen(port, () => console.log(`THE BHABISHYA running at http://localhost:${port}`));
