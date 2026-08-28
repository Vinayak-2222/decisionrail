import mongoose from "mongoose";

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/decisionrail";
  await mongoose.connect(uri);
  console.log(`[mongo] connected: ${uri}`);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}