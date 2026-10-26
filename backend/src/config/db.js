import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/litverse";
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 5000;

function getMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

function getServerSelectionTimeout() {
  const parsedTimeout = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS);

  if (Number.isFinite(parsedTimeout) && parsedTimeout > 0) {
    return parsedTimeout;
  }

  return DEFAULT_SERVER_SELECTION_TIMEOUT_MS;
}

function getConnectionHelpMessage(error) {
  if (
    error?.message?.includes("ECONNREFUSED") ||
    error?.message?.includes("EPERM")
  ) {
    return [
      "MongoDB is not accepting connections at the configured address.",
      "Start a local server with `npm run db:start` in `backend/` or update `MONGODB_URI` to a running instance.",
    ].join(" ");
  }

  if (error?.message?.includes("ENOTFOUND")) {
    return "The MongoDB host could not be resolved. Check the value of MONGODB_URI.";
  }

  if (!process.env.MONGODB_URI) {
    return `MONGODB_URI was not set, so the backend tried the default ${DEFAULT_MONGODB_URI}.`;
  }

  return "Failed to connect to MongoDB. Check MONGODB_URI, database credentials and the Atlas network access list (include Render outbound IP ranges).";
}

export async function connectDatabase() {
  const mongoUri = getMongoUri();

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: getServerSelectionTimeout(),
    });
    console.log("MongoDB connected.");
    return mongoose.connection;
  } catch (error) {
    // Driver messages can contain connection strings; never log them or the URI.
    console.error(getConnectionHelpMessage(error));
    throw error;
  }
}
