import { Schema, model, Document } from 'mongoose';

export interface ITracking extends Document {
  driverLatitude: number;
  driverLongitude: number;
  currentStopIndex: number;
  currentStopName: string;
  nextStopName: string;
  eta: string;
  completedCount: number;
  totalCount: number;
  isActive: boolean;
  updatedAt: Date;
}

const trackingSchema = new Schema<ITracking>(
  {
    driverLatitude: { type: Number, required: true },
    driverLongitude: { type: Number, required: true },
    currentStopIndex: { type: Number, default: 0 },
    currentStopName: { type: String, default: 'Warehouse' },
    nextStopName: { type: String, default: '' },
    eta: { type: String, default: 'Calculating...' },
    completedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 50 },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Tracking = model<ITracking>('Tracking', trackingSchema);
