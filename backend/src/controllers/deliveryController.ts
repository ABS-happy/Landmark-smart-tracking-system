import { Request, Response } from 'express';
import { Delivery } from '../models/Delivery';
import { Tracking } from '../models/Tracking';

// Get all delivery orders
export const getDeliveries = async (req: Request, res: Response) => {
  try {
    const deliveries = await Delivery.find().sort({ routeSequence: 1, serialNumber: 1 });
    return res.status(200).json(deliveries);
  } catch (error) {
    console.error('[DeliveryController] Error fetching deliveries:', error);
    return res.status(500).json({ error: 'Failed to retrieve delivery orders' });
  }
};

// Assign driver to selected delivery orders
export const assignDriver = async (req: Request, res: Response) => {
  try {
    const { deliveryIds, driverName } = req.body;

    if (!deliveryIds || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of delivery IDs' });
    }

    if (driverName !== undefined && typeof driverName !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid driver name' });
    }

    const isUnassigning = !driverName || driverName === 'Unassigned' || driverName === 'None' || driverName === '';

    let updateDoc;
    if (isUnassigning) {
      updateDoc = {
        $set: { status: 'Pending' },
        $unset: { assignedDriver: 1 }
      };
    } else {
      updateDoc = {
        $set: {
          status: 'Assigned',
          assignedDriver: driverName,
        }
      };
    }

    // Bulk update deliveries
    const result = await Delivery.updateMany(
      { _id: { $in: deliveryIds } },
      updateDoc as any
    );

    return res.status(200).json({
      message: isUnassigning 
        ? `Successfully unassigned ${result.modifiedCount} deliveries`
        : `Successfully assigned ${result.modifiedCount} deliveries to ${driverName}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('[DeliveryController] Error assigning driver:', error);
    return res.status(500).json({ error: 'Failed to assign driver to deliveries' });
  }
};

// Complete a single delivery
export const completeDelivery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const delivery = await Delivery.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'Completed',
          completedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery order not found' });
    }

    return res.status(200).json({
      message: `Delivery for ${delivery.customerName} marked as Completed`,
      delivery,
    });
  } catch (error) {
    console.error('[DeliveryController] Error completing delivery:', error);
    return res.status(500).json({ error: 'Failed to complete delivery order' });
  }
};

// Get active driver tracking metrics
export const getTracking = async (req: Request, res: Response) => {
  try {
    let tracking = await Tracking.findOne();
    if (!tracking) {
      // Create empty default tracking if none exists
      tracking = await Tracking.create({
        driverLatitude: 25.1386,
        driverLongitude: 55.2285,
        currentStopIndex: 0,
        currentStopName: 'Warehouse',
        nextStopName: '',
        eta: 'Calculating...',
        completedCount: 0,
        totalCount: 50,
        isActive: false,
      });
    }
    return res.status(200).json(tracking);
  } catch (error) {
    console.error('[DeliveryController] Error fetching tracking state:', error);
    return res.status(500).json({ error: 'Failed to retrieve driver tracking metrics' });
  }
};

// Update active driver tracking metrics
export const updateTracking = async (req: Request, res: Response) => {
  try {
    const { 
      driverLatitude, 
      driverLongitude, 
      currentStopIndex, 
      currentStopName, 
      nextStopName, 
      eta, 
      completedCount, 
      totalCount,
      isActive 
    } = req.body;

    let tracking = await Tracking.findOne();

    const updateFields = {
      driverLatitude: driverLatitude !== undefined ? driverLatitude : 25.1386,
      driverLongitude: driverLongitude !== undefined ? driverLongitude : 55.2285,
      currentStopIndex: currentStopIndex !== undefined ? currentStopIndex : 0,
      currentStopName: currentStopName !== undefined ? currentStopName : 'Warehouse',
      nextStopName: nextStopName !== undefined ? nextStopName : '',
      eta: eta !== undefined ? eta : 'Calculating...',
      completedCount: completedCount !== undefined ? completedCount : 0,
      totalCount: totalCount !== undefined ? totalCount : 50,
      isActive: isActive !== undefined ? isActive : false,
    };

    if (!tracking) {
      tracking = await Tracking.create(updateFields);
    } else {
      tracking = await Tracking.findByIdAndUpdate(
        tracking._id,
        { $set: updateFields },
        { new: true }
      );
    }

    return res.status(200).json(tracking);
  } catch (error) {
    console.error('[DeliveryController] Error updating tracking state:', error);
    return res.status(500).json({ error: 'Failed to update tracking metrics' });
  }
};

// Reset all deliveries status to Pending for demo/testing convenience
export const resetDeliveriesStatus = async (req: Request, res: Response) => {
  try {
    // Reset all deliveries
    const result = await Delivery.updateMany(
      {},
      {
        $set: {
          status: 'Pending',
          assignedDriver: undefined,
          routeSequence: undefined,
          completedAt: undefined,
        },
      }
    );

    // Reset tracking state
    await Tracking.deleteMany({});
    await Tracking.create({
      driverLatitude: 25.1386,
      driverLongitude: 55.2285,
      currentStopIndex: 0,
      currentStopName: 'Warehouse',
      nextStopName: '',
      eta: 'Calculating...',
      completedCount: 0,
      totalCount: 50,
      isActive: false,
    });

    return res.status(200).json({
      message: 'Successfully reset all deliveries and live tracking state',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('[DeliveryController] Error resetting deliveries:', error);
    return res.status(500).json({ error: 'Failed to reset delivery orders' });
  }
};

// Save optimized route sequence to deliveries
export const saveOptimizedRoute = async (req: Request, res: Response) => {
  try {
    const { deliveryIds } = req.body;

    if (!deliveryIds || !Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of delivery IDs' });
    }

    // Bulk update routeSequence for each delivery
    const operations = deliveryIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { routeSequence: index + 1 } },
      }
    }));

    await Delivery.bulkWrite(operations);

    return res.status(200).json({
      message: `Successfully saved optimized route sequence for ${deliveryIds.length} deliveries`,
    });
  } catch (error) {
    console.error('[DeliveryController] Error saving optimized route:', error);
    return res.status(500).json({ error: 'Failed to save optimized route sequence' });
  }
};
