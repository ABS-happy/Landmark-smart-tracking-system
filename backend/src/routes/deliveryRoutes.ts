import { Router } from 'express';
import { 
  getDeliveries, 
  assignDriver, 
  resetDeliveriesStatus, 
  getTracking, 
  updateTracking, 
  completeDelivery,
  saveOptimizedRoute
} from '../controllers/deliveryController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get all deliveries
router.get('/', authenticateToken as any, getDeliveries);

// Get tracking data
router.get('/tracking', authenticateToken as any, getTracking);

// Update tracking data
router.put('/tracking', authenticateToken as any, updateTracking);

// Complete a specific delivery
router.put('/:id/complete', authenticateToken as any, completeDelivery);

// Save optimized route sequence
router.put('/optimize', authenticateToken as any, saveOptimizedRoute);

// Assign driver to deliveries
router.put('/assign', authenticateToken as any, assignDriver);

// Reset deliveries status for testing
router.post('/reset', authenticateToken as any, resetDeliveriesStatus);

export default router;
