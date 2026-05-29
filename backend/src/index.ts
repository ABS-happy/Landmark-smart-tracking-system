import dns from 'dns';
// Set global DNS preference to IPv4-first to prevent localhost DNS resolution delays
dns.setDefaultResultOrder('ipv4first');

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import deliveryRoutes from './routes/deliveryRoutes';
import { apiLimiter } from './middleware/rateLimiter';
import { User } from './models/User';
import { Delivery } from './models/Delivery';
import bcrypt from 'bcrypt';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  })
);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000'
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.includes(origin) || 
                        origin.endsWith('.vercel.app') || 
                        /^http:\/\/localhost:\d+$/.test(origin) ||
                        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serverless / Vercel lazy database connection middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.VERCEL && mongoose.connection.readyState === 0) {
    try {
      await connectDB();
      await seedUsers();
      await seedDeliveries();
    } catch (err) {
      console.error('[Serverless DB Lazy Connect Error]', err);
    }
  }
  next();
});

// Global Rate Limiting
app.use('/api/', apiLimiter);

// Auth Routes
app.use('/api/auth', authRoutes);

// Delivery Routes
app.use('/api/deliveries', deliveryRoutes);

// Base Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Landmark Smart Route Planner Auth API is running.' });
});

// Env check endpoint to read key on disk and see if dev server restart is needed
app.get('/api/env-check', (req: Request, res: Response) => {
  try {
    const envFiles = ['.env.local', '.env.development', '.env.production', '.env'];
    let keyOnDisk = '';
    for (const file of envFiles) {
      const envPath = path.resolve(__dirname, '../../frontend', file);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/VITE_GOOGLE_MAPS_API_KEY\s*=\s*([^\s#]+)/);
        if (match) {
          keyOnDisk = match[1];
          break;
        }
      }
    }
    res.status(200).json({ keyOnDisk });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === 'development') {
  const devProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:5173',
    changeOrigin: true,
    ws: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/health')) {
      return next();
    }
    devProxy(req, res, next);
  });
} else {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.resolve(frontendDistPath, 'index.html'));
  });
}

// Seed Initial Accounts (Dispatcher & Driver)
const seedUsers = async () => {
  try {
    const adminExists = await User.findOne({ email: 'admin@landmark.com' });
    const driverExists = await User.findOne({ email: 'driver@landmark.com' });
    const dispatcherExists = await User.findOne({ email: 'dispatcher@landmark.com' });

    if (adminExists && driverExists && dispatcherExists && process.env.NODE_ENV !== 'development') {
      console.log('[Seed] Default test accounts already exist. Skipping delete/re-seed.');
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Seed] Re-seeding Admin, Dispatcher & Driver test accounts...');
      await User.deleteMany({});
    } else {
      console.log('[Seed] Seeding missing default accounts...');
    }

    const salt = await bcrypt.genSalt(10);

    if (!adminExists || process.env.NODE_ENV === 'development') {
      const adminPasswordHash = await bcrypt.hash('AdminPass123!', salt);
      await User.findOneAndUpdate(
        { email: 'admin@landmark.com' },
        {
          fullName: 'System Admin',
          phoneNumber: '+971500000000',
          passwordHash: adminPasswordHash,
          role: 'Admin',
          isVerified: true,
        },
        { upsert: true, new: true }
      );
    }

    if (!driverExists || process.env.NODE_ENV === 'development') {
      const driverPasswordHash = await bcrypt.hash('DriverPass123!', salt);
      await User.findOneAndUpdate(
        { email: 'driver@landmark.com' },
        {
          fullName: 'Sam Driver',
          phoneNumber: '+971500000001',
          passwordHash: driverPasswordHash,
          role: 'Driver',
          isVerified: true,
        },
        { upsert: true, new: true }
      );
    }

    if (!dispatcherExists || process.env.NODE_ENV === 'development') {
      const dispatcherPasswordHash = await bcrypt.hash('DispatchPass123!', salt);
      await User.findOneAndUpdate(
        { email: 'dispatcher@landmark.com' },
        {
          fullName: 'John Dispatcher',
          phoneNumber: '+971500000002',
          passwordHash: dispatcherPasswordHash,
          role: 'Dispatcher',
          isVerified: true,
        },
        { upsert: true, new: true }
      );
    }

    console.log('[Seed] Seeded default users successfully:');
    console.log(' - Admin: admin@landmark.com / AdminPass123!');
    console.log(' - Driver: driver@landmark.com / DriverPass123!');
    console.log(' - Dispatcher: dispatcher@landmark.com / DispatchPass123!');
  } catch (error) {
    console.error('[Seed] Error seeding default users:', error);
  }
};

// Seed Initial Dubai Deliveries
const seedDeliveries = async () => {
  try {
    const deliveryCount = await Delivery.countDocuments();
    if (deliveryCount === 0) {
      console.log('[Seed] Seeding 50 default Dubai deliveries...');
      const deliveriesData = [
        { serialNumber: 1, customerName: 'Ahmed Al-Maktoum', phoneNumber: '+971 50 111 2222', deliveryAddress: 'Villa 14, Street 2C, Jumeirah 1, Dubai', latitude: 25.2255, longitude: 55.2539, priority: 'High', status: 'Pending' },
        { serialNumber: 2, customerName: 'Fatima Al-Ghurair', phoneNumber: '+971 50 222 3333', deliveryAddress: 'Apartment 402, Marina Heights, Dubai Marina', latitude: 25.0784, longitude: 55.1353, priority: 'Normal', status: 'Pending' },
        { serialNumber: 3, customerName: 'Sarah Jenkins', phoneNumber: '+971 50 333 4444', deliveryAddress: 'Apartment 1501, Boulevard Plaza, Downtown Dubai', latitude: 25.1972, longitude: 55.2744, priority: 'High', status: 'Pending' },
        { serialNumber: 4, customerName: 'Rajesh Patel', phoneNumber: '+971 50 444 5555', deliveryAddress: 'Villa 82, Frond D, Palm Jumeirah', latitude: 25.1304, longitude: 55.1171, priority: 'Normal', status: 'Pending' },
        { serialNumber: 5, customerName: 'Mohammad Al-Sayegh', phoneNumber: '+971 50 555 6666', deliveryAddress: 'Villa 5A, Street 18, Al Barsha 1', latitude: 25.1168, longitude: 55.1994, priority: 'High', status: 'Pending' },
        { serialNumber: 6, customerName: 'John Doe', phoneNumber: '+971 50 666 7777', deliveryAddress: 'Warehouse 12, Street 15, Al Quoz 3', latitude: 25.1224, longitude: 55.2155, priority: 'Normal', status: 'Pending' },
        { serialNumber: 7, customerName: 'Yousuf Al-Hashemi', phoneNumber: '+971 50 777 8888', deliveryAddress: 'Villa 22, Street 3, Jumeirah 3', latitude: 25.1765, longitude: 55.2045, priority: 'Normal', status: 'Pending' },
        { serialNumber: 8, customerName: 'Amna Al-Suwaidi', phoneNumber: '+971 50 888 9999', deliveryAddress: 'Apartment 902, Regal Tower, Business Bay', latitude: 25.1852, longitude: 55.2678, priority: 'High', status: 'Pending' },
        { serialNumber: 9, customerName: 'Tariq Al-Habtoor', phoneNumber: '+971 50 999 0000', deliveryAddress: 'Villa 105, Dubai Silicon Oasis', latitude: 25.1264, longitude: 55.3789, priority: 'Normal', status: 'Pending' },
        { serialNumber: 10, customerName: 'David Smith', phoneNumber: '+971 50 123 0001', deliveryAddress: 'Villa 44, Street 12, Mirdif', latitude: 25.2163, longitude: 55.4215, priority: 'High', status: 'Pending' },
        { serialNumber: 11, customerName: 'Emily Brown', phoneNumber: '+971 50 123 0002', deliveryAddress: 'Shop 5, Gold Souk, Deira', latitude: 25.2736, longitude: 55.2974, priority: 'Normal', status: 'Pending' },
        { serialNumber: 12, customerName: 'Khaled Al-Balooshi', phoneNumber: '+971 50 123 0003', deliveryAddress: 'House 17, Al Fahidi Historical Area, Bur Dubai', latitude: 25.2573, longitude: 55.2925, priority: 'Normal', status: 'Pending' },
        { serialNumber: 13, customerName: 'Vikram Singh', phoneNumber: '+971 50 123 0004', deliveryAddress: 'Villa 20, Al Reem 1, Arabian Ranches', latitude: 25.0583, longitude: 55.2625, priority: 'High', status: 'Pending' },
        { serialNumber: 14, customerName: 'Maria Gomez', phoneNumber: '+971 50 123 0005', deliveryAddress: 'Apartment 1204, Cluster T, JLT', latitude: 25.0772, longitude: 55.1485, priority: 'Normal', status: 'Pending' },
        { serialNumber: 15, customerName: 'Ali Al-Mansoor', phoneNumber: '+971 50 123 0006', deliveryAddress: 'Apartment 303, Index Tower, DIFC', latitude: 25.2114, longitude: 55.2818, priority: 'High', status: 'Pending' },
        { serialNumber: 16, customerName: 'Zeyad Al-Marzooqi', phoneNumber: '+971 50 123 0007', deliveryAddress: 'Apartment 101, Building 45, Al Karama', latitude: 25.2415, longitude: 55.3015, priority: 'Normal', status: 'Pending' },
        { serialNumber: 17, customerName: 'Jessica Taylor', phoneNumber: '+971 50 123 0008', deliveryAddress: 'Apartment 512, Garhoud Views, Al Garhoud', latitude: 25.2443, longitude: 55.3444, priority: 'Normal', status: 'Pending' },
        { serialNumber: 18, customerName: 'Omar Al-Futtaim', phoneNumber: '+971 50 123 0009', deliveryAddress: 'Villa 8, Shorooq, Mirdif', latitude: 25.2144, longitude: 55.4055, priority: 'High', status: 'Pending' },
        { serialNumber: 19, customerName: 'Nabil Al-Rostamani', phoneNumber: '+971 50 123 0010', deliveryAddress: 'Office 402, Building 3, Dubai Design District', latitude: 25.1895, longitude: 55.3005, priority: 'Normal', status: 'Pending' },
        { serialNumber: 20, customerName: 'Priya Nair', phoneNumber: '+971 50 123 0011', deliveryAddress: 'Building F-12, England Cluster, International City', latitude: 25.1612, longitude: 55.4077, priority: 'Normal', status: 'Pending' },
        { serialNumber: 21, customerName: 'Marcus Vance', phoneNumber: '+971 50 123 0012', deliveryAddress: 'Street 3, Zen Cluster, Discovery Gardens', latitude: 25.0402, longitude: 55.1455, priority: 'High', status: 'Pending' },
        { serialNumber: 22, customerName: 'Saeed Al-Tayer', phoneNumber: '+971 50 123 0013', deliveryAddress: 'Office 12, Gate 4, Jebel Ali Free Zone', latitude: 24.9894, longitude: 55.0855, priority: 'Normal', status: 'Pending' },
        { serialNumber: 23, customerName: 'Leila Al-Mualla', phoneNumber: '+971 50 123 0014', deliveryAddress: 'Apartment 208, Green Community, Motor City', latitude: 25.0442, longitude: 55.2435, priority: 'Normal', status: 'Pending' },
        { serialNumber: 24, customerName: 'Arjun Kapoor', phoneNumber: '+971 50 123 0015', deliveryAddress: 'Apartment 705, Elite Sports Residence, Sports City', latitude: 25.0332, longitude: 55.2195, priority: 'High', status: 'Pending' },
        { serialNumber: 25, customerName: 'Robert Wilson', phoneNumber: '+971 50 123 0016', deliveryAddress: 'Building 3A, Al Khail Heights, Al Quoz 4', latitude: 25.1325, longitude: 55.2415, priority: 'Normal', status: 'Pending' },
        { serialNumber: 26, customerName: 'Humaid Al-Shamsi', phoneNumber: '+971 50 123 0017', deliveryAddress: 'Villa 12B, Street 19A, Al Safa 1', latitude: 25.1724, longitude: 55.2435, priority: 'Normal', status: 'Pending' },
        { serialNumber: 27, customerName: 'Aisha Al-Heri', phoneNumber: '+971 50 123 0018', deliveryAddress: 'Villa 41, Street 4, Umm Suqeim 2', latitude: 25.1614, longitude: 55.2035, priority: 'High', status: 'Pending' },
        { serialNumber: 28, customerName: 'Michael Chen', phoneNumber: '+971 50 123 0019', deliveryAddress: 'Apartment 1004, Marsa Plaza, Dubai Festival City', latitude: 25.2215, longitude: 55.3535, priority: 'Normal', status: 'Pending' },
        { serialNumber: 29, customerName: 'Fatima Al-Zarooni', phoneNumber: '+971 50 123 0020', deliveryAddress: 'Apartment 503, Building B, Al Nahda 2', latitude: 25.2965, longitude: 55.3745, priority: 'Normal', status: 'Pending' },
        { serialNumber: 30, customerName: 'Faisal Al-Sabah', phoneNumber: '+971 50 123 0021', deliveryAddress: 'Villa 22, Street 15, Al Qusais', latitude: 25.2745, longitude: 55.3855, priority: 'High', status: 'Pending' },
        { serialNumber: 31, customerName: 'Sophia Loren', phoneNumber: '+971 50 123 0022', deliveryAddress: 'House 8, Street 25, Rashidiya', latitude: 25.2295, longitude: 55.3975, priority: 'Normal', status: 'Pending' },
        { serialNumber: 32, customerName: 'Hamdan Al-Khouri', phoneNumber: '+971 50 123 0023', deliveryAddress: 'Villa 92, Nad Al Sheba 1', latitude: 25.1555, longitude: 55.3285, priority: 'Normal', status: 'Pending' },
        { serialNumber: 33, customerName: 'Ziad Al-Tariq', phoneNumber: '+971 50 123 0024', deliveryAddress: 'Villa 14, Al Safa 2', latitude: 25.1585, longitude: 55.2215, priority: 'High', status: 'Pending' },
        { serialNumber: 34, customerName: 'Laila Al-Gheithy', phoneNumber: '+971 50 123 0025', deliveryAddress: 'Villa 32, Canal Road, Jumeirah 2', latitude: 25.2055, longitude: 55.2345, priority: 'Normal', status: 'Pending' },
        { serialNumber: 35, customerName: 'Yasser Al-Kaabi', phoneNumber: '+971 50 123 0026', deliveryAddress: 'Warehouse 4, Street 10, Al Quoz 1', latitude: 25.1595, longitude: 55.2535, priority: 'Normal', status: 'Pending' },
        { serialNumber: 36, customerName: 'Noor Al-Hassan', phoneNumber: '+971 50 123 0027', deliveryAddress: 'Apartment 2304, Churchill Tower, Business Bay', latitude: 25.1745, longitude: 55.2795, priority: 'High', status: 'Pending' },
        { serialNumber: 37, customerName: 'Daniel Carter', phoneNumber: '+971 50 123 0028', deliveryAddress: 'Apartment 902, Park Place, Trade Centre 1', latitude: 25.2185, longitude: 55.2755, priority: 'Normal', status: 'Pending' },
        { serialNumber: 38, customerName: 'Reem Al-Hashimi', phoneNumber: '+971 50 123 0029', deliveryAddress: 'Palace Estate, Street 3, Za\'abeel 2', latitude: 25.2215, longitude: 55.2995, priority: 'Normal', status: 'Pending' },
        { serialNumber: 39, customerName: 'Mustafa Al-Jamil', phoneNumber: '+971 50 123 0030', deliveryAddress: 'Apartment 601, Oud Metha Apartments, Oud Metha', latitude: 25.2355, longitude: 55.3125, priority: 'High', status: 'Pending' },
        { serialNumber: 40, customerName: 'Karim Al-Fayed', phoneNumber: '+971 50 123 0031', deliveryAddress: 'Apartment 403, Al Mankhool Towers, Al Mankhool', latitude: 25.2495, longitude: 55.2955, priority: 'Normal', status: 'Pending' },
        { serialNumber: 41, customerName: 'George Lucas', phoneNumber: '+971 50 123 0032', deliveryAddress: 'Villa 18, Street 7A, Al Bada\'a', latitude: 25.2165, longitude: 55.2615, priority: 'Normal', status: 'Pending' },
        { serialNumber: 42, customerName: 'Steven Spielberg', phoneNumber: '+971 50 123 0033', deliveryAddress: 'Apartment 102, Building 8, Satwa', latitude: 25.2235, longitude: 55.2725, priority: 'High', status: 'Pending' },
        { serialNumber: 43, customerName: 'Christopher Nolan', phoneNumber: '+971 50 123 0034', deliveryAddress: 'Apartment 15, Building 2B, Al Jaffiliya', latitude: 25.2325, longitude: 55.2895, priority: 'Normal', status: 'Pending' },
        { serialNumber: 44, customerName: 'James Cameron', phoneNumber: '+971 50 123 0035', deliveryAddress: 'Apartment 803, Cluster A, Jumeirah Heights', latitude: 25.0685, longitude: 55.1595, priority: 'Normal', status: 'Pending' },
        { serialNumber: 45, customerName: 'Ridley Scott', phoneNumber: '+971 50 123 0036', deliveryAddress: 'Villa 41, Street 3, The Springs 2', latitude: 25.0595, longitude: 55.1785, priority: 'High', status: 'Pending' },
        { serialNumber: 46, customerName: 'Quentin Tarantino', phoneNumber: '+971 50 123 0037', deliveryAddress: 'Villa 12, Street 9, The Meadows 3', latitude: 25.0695, longitude: 55.1925, priority: 'Normal', status: 'Pending' },
        { serialNumber: 47, customerName: 'Martin Scorsese', phoneNumber: '+971 50 123 0038', deliveryAddress: 'Villa 84, Sector P, Emirates Hills', latitude: 25.0795, longitude: 55.1855, priority: 'Normal', status: 'Pending' },
        { serialNumber: 48, customerName: 'Alfred Hitchcock', phoneNumber: '+971 50 123 0039', deliveryAddress: 'Apartment 702, Barsha Heights', latitude: 25.0965, longitude: 55.1775, priority: 'High', status: 'Pending' },
        { serialNumber: 49, customerName: 'Stanley Kubrick', phoneNumber: '+971 50 123 0040', deliveryAddress: 'Apartment 105, Greens Building 4, Greens', latitude: 25.0935, longitude: 55.1835, priority: 'Normal', status: 'Pending' },
        { serialNumber: 50, customerName: 'JBR Customer', phoneNumber: '+971 50 123 0041', deliveryAddress: 'Apartment 2406, Rimal 3, Jumeirah Beach Residence', latitude: 25.0763, longitude: 55.1305, priority: 'Normal', status: 'Pending' },
      ];
      await Delivery.create(deliveriesData);
      console.log('[Seed] 50 default Dubai deliveries seeded successfully.');
    }
  } catch (error) {
    console.error('[Seed] Error seeding deliveries:', error);
  }
};

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({
    error: 'An internal server error occurred',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
  });
});

// Start Server (only for non-Vercel standalone deployment)
const startServer = async () => {
  await connectDB();
  await seedUsers();
  await seedDeliveries();
  
  app.listen(PORT, () => {
    console.log(`[Server] Landmark Auth Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
};

if (!process.env.VERCEL) {
  startServer();
}

// Export app for serverless deployment
export { app };
