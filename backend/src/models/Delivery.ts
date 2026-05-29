import { Schema, model, Document } from 'mongoose';

export interface IDelivery extends Document {
  serialNumber: number;
  customerName: string;
  phoneNumber: string;
  deliveryAddress: string;
  latitude: number;
  longitude: number;
  priority: 'High' | 'Normal';
  status: 'Pending' | 'Assigned' | 'In Transit' | 'Delivered' | 'Completed';
  assignedDriver?: string;
  routeSequence?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<IDelivery>(
  {
    serialNumber: { type: Number, required: true, unique: true },
    customerName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    priority: { type: String, enum: ['High', 'Normal'], required: true },
    status: {
      type: String,
      enum: ['Pending', 'Assigned', 'In Transit', 'Delivered', 'Completed'],
      default: 'Pending',
      required: true,
    },
    assignedDriver: { type: String },
    routeSequence: { type: Number },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const Delivery = model<IDelivery>('Delivery', deliverySchema);
