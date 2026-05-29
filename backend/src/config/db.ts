import mongoose from 'mongoose';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

export const connectDB = async (): Promise<void> => {
  const connUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/landmark_auth';
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(connUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      });
      console.log(`[Database] MongoDB Connected to: ${mongoose.connection.host}`);
      return;
    } catch (error) {
      const msg = (error as Error).message;
      console.error(`[Database] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      
      if (attempt === MAX_RETRIES) {
        console.error('[Database] All connection attempts exhausted. Exiting.');
        process.exit(1);
      }
      
      console.log(`[Database] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};
