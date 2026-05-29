import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { 
  LogOut, 
  Navigation, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  Map, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Layers, 
  Maximize2, 
  Minimize2, 
  MapPin, 
  RefreshCw, 
  Truck,
  Compass
} from 'lucide-react';
import toast from 'react-hot-toast';

declare const google: any;

// Geodesic distance formula between coordinates (km)
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Available': return '#10B981'; // Green
    case 'On Route': return '#003A8C'; // Blue
    case 'Near Delivery Point': return '#F59E0B'; // Orange
    case 'Offline': return '#EF4444'; // Red
    case 'Shift Completed': return '#6B7280'; // Gray
    default: return '#6B7280';
  }
};

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'Available': 
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On Route': 
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Near Delivery Point': 
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Offline': 
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Shift Completed': 
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default: 
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};



// Heuristic TSP solver (Nearest Neighbor)
const calculateOptimizedRoute = (warehouse: { lat: number; lng: number }, points: any[]) => {
  const unvisited = [...points];
  const route: any[] = [];
  let currentLoc = { lat: warehouse.lat, lng: warehouse.lng };

  while (unvisited.length > 0) {
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineDistance(
        currentLoc.lat,
        currentLoc.lng,
        unvisited[i].latitude,
        unvisited[i].longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    const nextStop = unvisited.splice(closestIndex, 1)[0];
    route.push(nextStop);
    currentLoc = { lat: nextStop.latitude, lng: nextStop.longitude };
  }

  return route;
};

interface DeliveryOrder {
  _id: string;
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
}

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (apiKey && !(window as any).googleScriptKeyPassed) {
    (window as any).googleScriptKeyPassed = true;
  }
  
  // Data State
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Table Controls State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('routeSequence');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const entriesPerPage = 10;

  // Map & Optimization State
  const [isMapModalOpen, setIsMapModalOpen] = useState<boolean>(false);
  const [mapTargetDelivery, setMapTargetDelivery] = useState<DeliveryOrder | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<DeliveryOrder[]>([]);
  const [isOptimized, setIsOptimized] = useState<boolean>(false);
  const [analytics, setAnalytics] = useState<{
    totalDistance: number;
    travelTime: string;
    fuelSavings: string;
    efficiencyScore: number;
  } | null>(null);

  // Live Tracking state
  const [trackingData, setTrackingData] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number }>({ lat: 25.1386, lng: 55.2285 });
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simStep, setSimStep] = useState<number>(0);
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState<boolean>(false);

  // 5 Drivers State & Definitions
  interface DriverState {
    name: string;
    phone: string;
    vehicle: string;
    color: string;
    label: string;
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    status: 'Available' | 'On Route' | 'Near Delivery Point' | 'Offline' | 'Shift Completed';
    currentStopIndex: number;
    simStep: number;
  }

  const DRIVERS = [
    { name: 'Ahmed Al Maktoum', phone: '+971 50 111 1111', vehicle: 'DXB-101-A', color: '#D4AF37', label: 'AH' },
    { name: 'Mohammed Rashid', phone: '+971 50 222 2222', vehicle: 'DXB-202-B', color: '#003A8C', label: 'MO' },
    { name: 'Ali Saeed', phone: '+971 50 333 3333', vehicle: 'DXB-303-C', color: '#10B981', label: 'AL' },
    { name: 'Omar Hassan', phone: '+971 50 444 4444', vehicle: 'DXB-404-D', color: '#EF4444', label: 'OM' },
    { name: 'Khalid Noor', phone: '+971 50 555 5555', vehicle: 'DXB-505-E', color: '#8B5CF6', label: 'KH' },
  ];

  const INITIAL_DRIVERS_STATE: DriverState[] = DRIVERS.map((d, index) => ({
    ...d,
    lat: 25.1386,
    lng: 55.2285,
    speed: 0,
    heading: 0,
    status: index === 3 ? 'Offline' : 'Available', // Omar (index 3) starts offline
    currentStopIndex: 0,
    simStep: 0,
  }));

  const [drivers, setDrivers] = useState<DriverState[]>(INITIAL_DRIVERS_STATE);
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>('');

  interface MapsDiagnosticError {
    code: string;
    message: string;
  }
  const [googleMapsError, setGoogleMapsError] = useState<MapsDiagnosticError | null>(null);
  const [forceLeaflet, setForceLeaflet] = useState<boolean>(false);

  // Heuristic for smart driver assignment
  const getRecommendedDriver = (itemLat: number, itemLng: number) => {
    let bestDriver = DRIVERS[0].name;
    let minScore = Infinity;

    drivers.forEach((d) => {
      if (d.status === 'Offline' || d.status === 'Shift Completed') return;
      
      const workload = deliveries.filter(
        (del) => del.assignedDriver === d.name && del.status !== 'Completed'
      ).length;
      
      const distance = haversineDistance(d.lat, d.lng, itemLat, itemLng);
      const score = workload * 50 + distance;

      if (score < minScore) {
        minScore = score;
        bestDriver = d.name;
      }
    });

    return bestDriver;
  };

  // Static operational coordinates
  const warehouseLoc = { lat: 25.1386, lng: 55.2285 }; // Al Quoz Warehouse

  // Map elements refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet'>('google');
  const [googleMap, setGoogleMap] = useState<any>(null);
  const [leafletMap, setLeafletMap] = useState<any>(null);
  
  // Keep track of map overlays
  const googleMarkersRef = useRef<any[]>([]);
  const googlePolylinesRef = useRef<any[]>([]);
  const leafletMarkersRef = useRef<any[]>([]);
  const leafletPolylinesRef = useRef<any[]>([]);

  // Map Layers status
  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [satelliteView, setSatelliteView] = useState<boolean>(false);
  const [googleTrafficLayer, setGoogleTrafficLayer] = useState<any>(null);

  const calculateAndSetAnalytics = (route: DeliveryOrder[]) => {
    if (route.length === 0) return;
    
    // Unoptimized total path distance
    let unoptimizedDistance = haversineDistance(warehouseLoc.lat, warehouseLoc.lng, deliveries[0]?.latitude || warehouseLoc.lat, deliveries[0]?.longitude || warehouseLoc.lng);
    for (let i = 0; i < deliveries.length - 1; i++) {
      unoptimizedDistance += haversineDistance(deliveries[i].latitude, deliveries[i].longitude, deliveries[i + 1].latitude, deliveries[i + 1].longitude);
    }
    if (deliveries.length > 0) {
      unoptimizedDistance += haversineDistance(deliveries[deliveries.length - 1].latitude, deliveries[deliveries.length - 1].longitude, warehouseLoc.lat, warehouseLoc.lng);
    }

    // Optimized path distance
    let optimizedDistance = haversineDistance(warehouseLoc.lat, warehouseLoc.lng, route[0].latitude, route[0].longitude);
    for (let i = 0; i < route.length - 1; i++) {
      optimizedDistance += haversineDistance(route[i].latitude, route[i].longitude, route[i + 1].latitude, route[i + 1].longitude);
    }
    optimizedDistance += haversineDistance(route[route.length - 1].latitude, route[route.length - 1].longitude, warehouseLoc.lat, warehouseLoc.lng);

    const distanceSaved = Math.max(0, unoptimizedDistance - optimizedDistance);
    
    // 50 km/h average speed in city + 4.5 minutes delivery stop time overhead per delivery
    const totalMins = (optimizedDistance / 48) * 60 + (route.length * 4.5);
    const hrs = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);
    const timeStr = `${hrs}h ${mins}m`;

    // Assuming 14L/100km fuel consumption, fuel costs around 3.1 AED per Liter in Dubai
    const fuelSavedLiters = distanceSaved * 0.14;
    const aedSaved = fuelSavedLiters * 3.1;
    const fuelSavingsStr = `${fuelSavedLiters.toFixed(1)}L Saved (~AED ${aedSaved.toFixed(0)})`;

    // Route efficiency score based on percentage improvement over random
    const score = Math.min(98, Math.max(82, Math.round(100 - (optimizedDistance / (unoptimizedDistance || 1)) * 16)));

    setAnalytics({
      totalDistance: Number(optimizedDistance.toFixed(1)),
      travelTime: timeStr,
      fuelSavings: fuelSavingsStr,
      efficiencyScore: score
    });
  };

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const response = await api.get('/deliveries');
      const data = response.data;
      setDeliveries(data);
      
      // Auto-detect optimization from DB
      const hasSequence = data.some((d: any) => d.routeSequence !== undefined && d.routeSequence !== null);
      if (hasSequence) {
        const sorted = [...data].sort((a, b) => (a.routeSequence || 0) - (b.routeSequence || 0));
        setOptimizedRoute(sorted);
        setIsOptimized(true);
        calculateAndSetAnalytics(sorted);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load delivery orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  // Polling & Multi-Driver Live GPS Tracking Simulation for Dispatcher
  useEffect(() => {
    if (user?.role !== 'Dispatcher' && user?.role !== 'Admin') return;
    
    const interval = setInterval(async () => {
      let latestDeliveries = deliveries;
      try {
        const delivRes = await api.get('/deliveries');
        setDeliveries(delivRes.data);
        latestDeliveries = delivRes.data;
        
        const trackRes = await api.get('/deliveries/tracking');
        setTrackingData(trackRes.data);
      } catch (err) {
        console.error('Error polling tracking details:', err);
      }

      // Update multi-driver simulation positions
      setDrivers((prevDrivers) => {
        return prevDrivers.map((driver) => {
          // 1. Omar Hassan starts Offline, let's keep him offline (red)
          if (driver.name === 'Omar Hassan' && driver.status === 'Offline') {
            return driver;
          }

          // 2. Ahmed Al Maktoum matches active logged-in Driver trackingData if it is running
          if (driver.name === 'Ahmed Al Maktoum' && trackingData && trackingData.isActive) {
            return {
              ...driver,
              lat: trackingData.driverLatitude,
              lng: trackingData.driverLongitude,
              status: trackingData.completedCount === trackingData.totalCount ? 'Available' : 'On Route',
              speed: 48,
              heading: 90,
            };
          }

          // 3. Otherwise, simulate active route execution
          const driverPending = latestDeliveries
            .filter((item) => item.assignedDriver === driver.name && item.status !== 'Completed')
            .sort((a, b) => (a.routeSequence || 99) - (b.routeSequence || 99));

          const allAssigned = latestDeliveries.filter((item) => item.assignedDriver === driver.name);

          // If no assigned pending stops
          if (driverPending.length === 0) {
            // Return to warehouse if not already there
            const distToWh = haversineDistance(driver.lat, driver.lng, warehouseLoc.lat, warehouseLoc.lng);
            if (distToWh > 0.05) {
              const nextStep = driver.simStep + 1;
              const totalSteps = 4;
              let newLat = driver.lat + (warehouseLoc.lat - driver.lat) * (1 / (totalSteps - driver.simStep));
              let newLng = driver.lng + (warehouseLoc.lng - driver.lng) * (1 / (totalSteps - driver.simStep));
              
              if (nextStep >= totalSteps) {
                newLat = warehouseLoc.lat;
                newLng = warehouseLoc.lng;
              }

              const heading = Math.atan2(warehouseLoc.lng - driver.lng, warehouseLoc.lat - driver.lat) * (180 / Math.PI);
              
              return {
                ...driver,
                lat: newLat,
                lng: newLng,
                speed: 50,
                heading: heading >= 0 ? heading : heading + 360,
                status: 'On Route',
                simStep: nextStep >= totalSteps ? 0 : nextStep,
              };
            }

            return {
              ...driver,
              lat: warehouseLoc.lat,
              lng: warehouseLoc.lng,
              speed: 0,
              heading: 0,
              status: 'Available',
              currentStopIndex: 0,
              simStep: 0,
            };
          }

          // Driver has assigned pending deliveries!
          const nextTarget = driverPending[0];
          const nextStep = driver.simStep + 1;
          const totalSteps = 3;

          let startLoc = warehouseLoc;
          if (driver.currentStopIndex > 0) {
            const completed = allAssigned.filter((item) => item.status === 'Completed');
            if (completed.length > 0) {
              const lastCompleted = completed[completed.length - 1];
              startLoc = { lat: lastCompleted.latitude, lng: lastCompleted.longitude };
            }
          }

          const endLoc = { lat: nextTarget.latitude, lng: nextTarget.longitude };
          let newLat = startLoc.lat + (endLoc.lat - startLoc.lat) * (nextStep / totalSteps);
          let newLng = startLoc.lng + (endLoc.lng - startLoc.lng) * (nextStep / totalSteps);

          const heading = Math.atan2(endLoc.lng - driver.lng, endLoc.lat - driver.lat) * (180 / Math.PI);
          const distanceToTarget = haversineDistance(newLat, newLng, endLoc.lat, endLoc.lng) * 1000;

          let status: any = 'On Route';
          let speed = Math.round(40 + Math.random() * 20);

          if (nextStep >= totalSteps || distanceToTarget <= 100) {
            newLat = endLoc.lat;
            newLng = endLoc.lng;
            status = 'Near Delivery Point';
            speed = 0;
          }

          if (status === 'Near Delivery Point') {
            // Call backend endpoint to mark this delivery completed
            api.put(`/deliveries/${nextTarget._id}/complete`).then(() => {
              setDeliveries((prev) =>
                prev.map((d) =>
                  d._id === nextTarget._id
                    ? { ...d, status: 'Completed', completedAt: new Date() }
                    : d
                )
              );
              toast.success(`[Delivery Completed] ${driver.name} delivered to ${nextTarget.customerName}.`);
            }).catch(console.error);

            return {
              ...driver,
              lat: newLat,
              lng: newLng,
              speed,
              heading: heading >= 0 ? heading : heading + 360,
              status,
              currentStopIndex: driver.currentStopIndex + 1,
              simStep: 0,
            };
          }

          return {
            ...driver,
            lat: newLat,
            lng: newLng,
            speed,
            heading: heading >= 0 ? heading : heading + 360,
            status,
            simStep: nextStep,
          };
        });
      });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [user, deliveries, trackingData]);

  // Driver GPS simulation hook
  useEffect(() => {
    if (user?.role !== 'Driver' || !isSimulating || isWaitingConfirmation) return;

    const interval = setInterval(async () => {
      // Find all pending deliveries in route order
      const pendingDeliveries = deliveries.filter(d => d.status !== 'Completed');
      
      if (pendingDeliveries.length === 0) {
        setIsSimulating(false);
        toast.success('Route completed! All 50 deliveries have been completed.');
        try {
          await api.put('/deliveries/tracking', { isActive: false });
        } catch (e) {}
        return;
      }

      // Next target delivery
      const targetDelivery = pendingDeliveries[0];
      const targetIndex = deliveries.findIndex(d => d._id === targetDelivery._id);
      
      // Determine segment start
      let startLoc = warehouseLoc;
      if (targetIndex > 0) {
        const prevDelivery = deliveries[targetIndex - 1];
        startLoc = { lat: prevDelivery.latitude, lng: prevDelivery.longitude };
      }

      const endLoc = { lat: targetDelivery.latitude, lng: targetDelivery.longitude };
      
      // Calculate step
      const nextStep = simStep + 1;
      const totalStepsPerSegment = 3;

      let newLat = startLoc.lat + (endLoc.lat - startLoc.lat) * (nextStep / totalStepsPerSegment);
      let newLng = startLoc.lng + (endLoc.lng - startLoc.lng) * (nextStep / totalStepsPerSegment);
      
      setDriverPos({ lat: newLat, lng: newLng });
      setSimStep(nextStep);

      // Check if we arrived (within 50 meters or step completed)
      const currentDistance = haversineDistance(newLat, newLng, endLoc.lat, endLoc.lng) * 1000;
      if (nextStep >= totalStepsPerSegment || currentDistance <= 50) {
        setIsWaitingConfirmation(true);
        newLat = endLoc.lat;
        newLng = endLoc.lng;
        setDriverPos({ lat: newLat, lng: newLng });
      }

      // Update backend tracking
      const completedCount = deliveries.filter(d => d.status === 'Completed').length;
      try {
        await api.put('/deliveries/tracking', {
          driverLatitude: newLat,
          driverLongitude: newLng,
          currentStopIndex: targetIndex + 1,
          currentStopName: targetDelivery.customerName,
          nextStopName: pendingDeliveries[1] ? pendingDeliveries[1].customerName : 'Warehouse',
          eta: `${Math.round(haversineDistance(newLat, newLng, endLoc.lat, endLoc.lng) * 1.5 + 1)} mins`,
          completedCount,
          totalCount: deliveries.length,
          isActive: true
        });
      } catch (err) {
        console.error('Error updating tracking:', err);
      }

    }, 2500);

    return () => clearInterval(interval);
  }, [user, isSimulating, isWaitingConfirmation, simStep, deliveries]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout error occurred');
    }
  };

  // Reset deliveries back to Pending
  const handleResetDemo = async () => {
    try {
      setRefreshing(true);
      await api.post('/deliveries/reset');
      toast.success('Demonstration reset successfully!');
      await fetchDeliveries();
      setIsOptimized(false);
      setOptimizedRoute([]);
      setAnalytics(null);
      setIsSimulating(false);
      setIsWaitingConfirmation(false);
      setTrackingData(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reset demo data');
    } finally {
      setRefreshing(false);
    }
  };

  const getDriverWorkload = (driverName: string) => {
    return deliveries.filter(
      d => d.assignedDriver === driverName && d.status !== 'Completed'
    ).length;
  };

  // Assign driver to deliveries (single/bulk)
  const handleAssignDriver = async (deliveryIds: string[], driverName: string) => {
    try {
      const isUnassigning = !driverName || driverName === 'Unassigned' || driverName === 'None' || driverName === '';
      const response = await api.put('/deliveries/assign', { deliveryIds, driverName });
      
      setDeliveries(prev => 
        prev.map(d => {
          if (deliveryIds.includes(d._id)) {
            if (isUnassigning) {
              const { assignedDriver, ...rest } = d;
              return { ...rest, status: 'Pending' as const };
            } else {
              return { ...d, assignedDriver: driverName, status: 'Assigned' as const };
            }
          }
          return d;
        })
      );

      toast.success(response.data.message || 'Driver assigned successfully');
      setSelectedDeliveryIds(prev => prev.filter(id => !deliveryIds.includes(id)));
      setActiveDropdownRowId(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to assign driver');
    }
  };

  // Trigger Smart Route optimization Heuristic
  const handleGenerateSmartRoute = async () => {
    if (deliveries.length === 0) return;
    
    // Optimize route
    const optimized = calculateOptimizedRoute(warehouseLoc, deliveries);
    setOptimizedRoute(optimized);
    setIsOptimized(true);
    calculateAndSetAnalytics(optimized);

    // Save optimized sequence to database automatically
    try {
      const deliveryIds = optimized.map(item => item._id);
      await api.put('/deliveries/optimize', { deliveryIds });
      toast.success('Smart Route Generated & Saved!');
      await fetchDeliveries();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save optimized route');
    }
  };

  const handleStartRoute = async () => {
    if (!isOptimized) {
      await handleGenerateSmartRoute();
    }

    try {
      await api.put('/deliveries/tracking', {
        driverLatitude: warehouseLoc.lat,
        driverLongitude: warehouseLoc.lng,
        currentStopIndex: 0,
        currentStopName: 'Warehouse',
        nextStopName: optimizedRoute[0]?.customerName || '',
        eta: 'Calculating...',
        completedCount: 0,
        totalCount: deliveries.length,
        isActive: true
      });
    } catch (e) {}

    setDriverPos(warehouseLoc);
    setSimStep(0);
    setIsWaitingConfirmation(false);
    setIsSimulating(true);
    setIsMapModalOpen(true);
    toast.success("Live route session started! Let's go!");
  };

  const handleConfirmDelivery = async () => {
    const pendingDeliveries = deliveries.filter(d => d.status !== 'Completed');
    if (pendingDeliveries.length === 0) return;

    const targetDelivery = pendingDeliveries[0];
    try {
      await api.put(`/deliveries/${targetDelivery._id}/complete`);
      
      setDeliveries(prev => 
        prev.map(d => 
          d._id === targetDelivery._id 
            ? { ...d, status: 'Completed', completedAt: new Date() } 
            : d
        )
      );

      toast.success(`Delivery to ${targetDelivery.customerName} completed.`);
      setIsWaitingConfirmation(false);
      setSimStep(0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to confirm delivery');
    }
  };

  // Custom SVG Markers Builder
  const getSvgPin = (color: string, numberLabel: string = '') => {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="30" height="38">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 20 12 20s12-10.7 12-20c0-6.63-5.37-12-12-12z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="9" fill="#ffffff" opacity="0.18"/>
      ${numberLabel ? `<text x="12" y="16" fill="#ffffff" font-size="10" font-family="Inter, sans-serif" font-weight="bold" text-anchor="middle">${numberLabel}</text>` : ''}
    </svg>`;
  };

  // Initialize Map Engine (Google Maps with dynamic Leaflet fallback)
  useEffect(() => {
    if (!isMapModalOpen || !mapContainerRef.current) return;

    let googleScriptLoaded = false;
    let fallbackTimeout: any = null;
    const originalConsoleError = console.error;

    if (leafletMap) {
      try {
        leafletMap.remove();
      } catch (e) {}
      setLeafletMap(null);
    }
    setGoogleMap(null);

    const loadLeafletFallback = async () => {
      setMapEngine('leaflet');
      if (!(window as any).L) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }

      if (!mapContainerRef.current) return;
      const L = (window as any).L;

      const mapCenter = mapTargetDelivery ? [mapTargetDelivery.latitude, mapTargetDelivery.longitude] : [warehouseLoc.lat, warehouseLoc.lng];
      const zoomLevel = mapTargetDelivery ? 13 : 11;
      
      const map = L.map(mapContainerRef.current, {
        center: mapCenter,
        zoom: zoomLevel,
        zoomControl: false,
        attributionControl: false
      });

      const streetTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
      });
      const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });

      if (satelliteView) {
        satelliteTiles.addTo(map);
      } else {
        streetTiles.addTo(map);
      }

      setLeafletMap(map);
    };

    if (forceLeaflet) {
      loadLeafletFallback();
      return;
    }

    setGoogleMapsError(null);

    const initGoogleMap = () => {
      if (!mapContainerRef.current) return;
      
      const mapOptions = {
        center: mapTargetDelivery ? { lat: mapTargetDelivery.latitude, lng: mapTargetDelivery.longitude } : warehouseLoc,
        zoom: mapTargetDelivery ? 13 : 11,
        mapTypeId: satelliteView ? 'satellite' : 'roadmap',
        mapTypeControl: false,
        zoomControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      };

      try {
        const map = new google.maps.Map(mapContainerRef.current, mapOptions);
        setGoogleMap(map);
        setMapEngine('google');
        googleScriptLoaded = true;
      } catch (err: any) {
        console.error('[MapEngine] Google maps rendering failed:', err);
        setGoogleMapsError({
          code: 'RenderError',
          message: err?.message || 'Google Maps failed to initialize the map object on the canvas container.',
        });
      }
    };

    // Dynamic environment check via backend to detect modifications on disk
    const checkEnvOnDisk = async () => {
      try {
        const res = await api.get('/env-check');
        if (res.data && res.data.keyOnDisk !== undefined) {
          const keyOnDisk = res.data.keyOnDisk;
          if (keyOnDisk !== apiKey) {
            console.warn('[MapEngine] Google Maps API key has changed on disk. Restart the development server to apply.');
          }
        }
      } catch (err) {
        console.error('[MapEngine] Env check failed:', err);
      }
    };
    checkEnvOnDisk();

    const validateGoogleMapsApiKey = (key: string): boolean => {
      if (!key) return false;
      if (key.length !== 39) return false;
      if (!key.startsWith('AIzaSy')) return false;
      const regex = /^AIzaSy[A-Za-z0-9_-]{33}$/;
      return regex.test(key);
    };

    const maskApiKey = (key: string): string => {
      if (!key) return '✗ Key Missing';
      if (key.length < 10) return '*'.repeat(key.length);
      return key.substring(0, 4) + '*'.repeat(Math.max(1, key.length - 7)) + key.substring(key.length - 3);
    };

    // Logging Key Status
    if (apiKey) {
      console.log("Google Maps Key Status:\n✓ Loaded Successfully\n" + maskApiKey(apiKey));
    } else {
      console.log("Google Maps Key Status:\n✗ Key Missing");
    }

    if (!apiKey || !validateGoogleMapsApiKey(apiKey)) {
      setGoogleMapsError({
        code: 'InvalidKeyMapError',
        message: 'Google Maps API Key Missing or Invalid',
      });
      setForceLeaflet(true);
      return;
    }

    if (apiKey) {
      (window as any).googleScriptKeyPassed = true;
    }

    // Register global auth failure listener
    (window as any).gm_authFailure = () => {
      setGoogleMapsError({
        code: 'AuthenticationError',
        message: 'Google Maps API key validation failed. Check that billing is active, the key is correct, and restrictions allow this origin.',
      });
      setForceLeaflet(true);
    };

    // Override console.error to capture specific API error codes
    console.error = (...args: any[]) => {
      const msg = args.join(' ');
      if (msg.includes('Google Maps') || msg.includes('MapError') || msg.includes('maps.googleapis.com')) {
        let errorCode = 'ApiError';
        const match = msg.match(/([a-zA-Z0-9]+MapError|[a-zA-Z0-9]+MapWarning)/);
        if (match) {
          errorCode = match[1];
        } else if (msg.includes('BillingNotEnabled')) {
          errorCode = 'BillingNotEnabledMapError';
        } else if (msg.includes('ApiNotActivated')) {
          errorCode = 'ApiNotActivatedMapError';
        } else if (msg.includes('RefererNotAllowed')) {
          errorCode = 'RefererNotAllowedMapError';
        } else if (msg.includes('InvalidKey')) {
          errorCode = 'InvalidKeyMapError';
        }

        // Detect disabled sub-APIs specifically
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes('places api') || lowerMsg.includes('places library')) {
          errorCode = 'PlacesApiNotEnabled';
        } else if (lowerMsg.includes('geocoding api')) {
          errorCode = 'GeocodingApiNotEnabled';
        } else if (lowerMsg.includes('directions api')) {
          errorCode = 'DirectionsApiNotEnabled';
        } else if (lowerMsg.includes('distance matrix api')) {
          errorCode = 'DistanceMatrixApiNotEnabled';
        }

        setGoogleMapsError({
          code: errorCode,
          message: msg,
        });
        setForceLeaflet(true);
      }
      originalConsoleError.apply(console, args);
    };

    if (!apiKey) {
      setGoogleMapsError({
        code: 'MissingApiKeyError',
        message: 'No Google Maps API Key found in env configuration. Check VITE_GOOGLE_MAPS_API_KEY.',
      });
      setForceLeaflet(true);
    }

    if ((window as any).google && (window as any).google.maps && !googleMapsError) {
      initGoogleMap();
    } else {
      const scriptId = 'google-maps-api-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        const keyParam = apiKey ? `key=${apiKey}&` : '';
        script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}language=en&region=US&callback=initMapCallback`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else if ((window as any).google && (window as any).google.maps) {
        initGoogleMap();
      }

      (window as any).initMapCallback = () => {
        initGoogleMap();
        delete (window as any).initMapCallback;
      };

      fallbackTimeout = setTimeout(() => {
        if (!googleScriptLoaded && !googleMapsError) {
          console.warn('[MapEngine] Google Maps load failed or timed out. Triggering fallback diagnostics.');
          setGoogleMapsError({
            code: 'NetworkError',
            message: 'Failed to load Google Maps script from maps.googleapis.com. Please check your internet connection or DNS restrictions.'
          });
          setForceLeaflet(true);
        }
      }, 3500);
    }

    return () => {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      console.error = originalConsoleError; // Restore original console error log
      delete (window as any).gm_authFailure;
      delete (window as any).initMapCallback;
    };
  }, [isMapModalOpen, forceLeaflet]);

  // Update Map layers & Map Type when options change
  useEffect(() => {
    if (mapEngine === 'google' && googleMap) {
      googleMap.setMapTypeId(satelliteView ? 'satellite' : 'roadmap');
      if (showTraffic) {
        if (!googleTrafficLayer) {
          const trafficLayer = new google.maps.TrafficLayer();
          trafficLayer.setMap(googleMap);
          setGoogleTrafficLayer(trafficLayer);
        } else {
          googleTrafficLayer.setMap(googleMap);
        }
      } else if (googleTrafficLayer) {
        googleTrafficLayer.setMap(null);
      }
    } else if (mapEngine === 'leaflet' && leafletMap) {
      const L = (window as any).L;
      leafletMap.eachLayer((layer: any) => {
        if (layer instanceof L.TileLayer) {
          leafletMap.removeLayer(layer);
        }
      });

      if (satelliteView) {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(leafletMap);
      } else {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
        }).addTo(leafletMap);
      }
    }
  }, [satelliteView, showTraffic, googleMap, leafletMap, mapEngine]);

  const formatCompletedTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Plot Map Markers & Polylines whenever map loads or optimized path changes
  useEffect(() => {
    const currentDriverPos = user?.role === 'Driver' 
      ? (isSimulating ? driverPos : null)
      : (trackingData && trackingData.isActive ? { lat: trackingData.driverLatitude, lng: trackingData.driverLongitude } : null);

    const getVehiclePin = (color: string, label: string = '🚚') => {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="34" height="42">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 9.3 12 20 12 20s12-10.7 12-20c0-6.63-5.37-12-12-12z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="12" cy="12" r="9" fill="#ffffff" opacity="0.3"/>
        <text x="12" y="17" fill="#ffffff" font-size="10" font-family="Inter, sans-serif" font-weight="extrabold" text-anchor="middle">${label}</text>
      </svg>`;
    };

    const drawGooglePolyline = (points: {lat: number, lng: number}[], color: string, opacity: number, weight: number) => {
      const poly = new google.maps.Polyline({
        path: points,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: opacity,
        strokeWeight: weight,
        map: googleMap
      });
      googlePolylinesRef.current.push(poly);
    };

    const drawLeafletPolyline = (points: [number, number][], color: string, opacity: number, weight: number) => {
      const L = (window as any).L;
      const poly = L.polyline(points, {
        color: color,
        weight: weight,
        opacity: opacity
      }).addTo(leafletMap);
      leafletPolylinesRef.current.push(poly);
    };

    if (mapEngine === 'google' && googleMap) {
      googleMarkersRef.current.forEach(m => m.setMap(null));
      googleMarkersRef.current = [];
      googlePolylinesRef.current.forEach(p => p.setMap(null));
      googlePolylinesRef.current = [];

      const bounds = new google.maps.LatLngBounds();

      // Warehouse Marker (Blue pin)
      const whMarker = new google.maps.Marker({
        position: warehouseLoc,
        map: googleMap,
        title: 'Warehouse Base',
        icon: {
          url: `data:image/svg+xml;utf-8,${encodeURIComponent(getSvgPin('#003A8C', '🏠'))}`,
          anchor: new google.maps.Point(15, 38),
        }
      });
      whMarker.addListener('click', () => {
        const info = new google.maps.InfoWindow({
          content: '<div style="font-family:Inter;padding:6px;color:#1e293b;"><b style="color:#003A8C;">Warehouse Base</b><br/>Al Quoz Industrial, Dubai</div>'
        });
        info.open(googleMap, whMarker);
      });
      googleMarkersRef.current.push(whMarker);
      bounds.extend(warehouseLoc);

      if (user?.role === 'Driver') {
        // DRIVER WORKSPACE - Single driver
        const activeRoute = isOptimized ? optimizedRoute : deliveries;

        activeRoute.forEach((item, index) => {
          let markerColor = item.priority === 'High' ? '#EF4444' : '#10B981';
          if (item.status === 'Completed') {
            markerColor = '#6B7280';
          }

          const isLocatingTarget = mapTargetDelivery?._id === item._id;

          const dMarker = new google.maps.Marker({
            position: { lat: item.latitude, lng: item.longitude },
            map: googleMap,
            title: item.customerName,
            icon: {
              url: `data:image/svg+xml;utf-8,${encodeURIComponent(getSvgPin(isLocatingTarget ? '#C9A227' : markerColor, String(index + 1)))}`,
              anchor: new google.maps.Point(15, 38),
            },
            animation: isLocatingTarget ? google.maps.Animation.BOUNCE : null
          });

          const popupContent = `
            <div style="font-family: Inter, sans-serif; padding: 10px; max-width: 220px; color:#1e293b;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:10px;font-weight:bold;color:#fff;background:${markerColor};padding:2px 6px;border-radius:4px;">Stop ${index + 1}</span>
                <span style="font-size:10px;font-weight:700;color:${item.priority === 'High' ? '#EF4444' : '#10B981'}">${item.priority} Priority</span>
              </div>
              <h4 style="margin: 0 0 5px 0; color: #003A8C; font-weight: 800; font-size: 13px;">${item.customerName}</h4>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Phone:</b> ${item.phoneNumber}</p>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Address:</b> ${item.deliveryAddress}</p>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Status:</b> <span style="font-weight: bold; color: ${item.status === 'Completed' ? '#6B7280' : '#003A8C'}">${item.status}</span></p>
            </div>
          `;

          const info = new google.maps.InfoWindow({ content: popupContent });
          dMarker.addListener('click', () => info.open(googleMap, dMarker));
          googleMarkersRef.current.push(dMarker);
          bounds.extend({ lat: item.latitude, lng: item.longitude });
        });

        if (currentDriverPos) {
          const vehicleMarker = new google.maps.Marker({
            position: currentDriverPos,
            map: googleMap,
            title: 'Current Driver Position',
            icon: {
              url: `data:image/svg+xml;utf-8,${encodeURIComponent(getSvgPin('#D4AF37', '🚚'))}`,
              anchor: new google.maps.Point(15, 38),
            },
            zIndex: 1000
          });
          googleMarkersRef.current.push(vehicleMarker);
          
          if (isSimulating) {
            googleMap.setCenter(currentDriverPos);
          }
        }

        if (isOptimized && activeRoute.length > 0) {
          const pathCoords = [
            warehouseLoc,
            ...activeRoute.map(item => ({ lat: item.latitude, lng: item.longitude })),
            warehouseLoc
          ];
          drawGooglePolyline(pathCoords, '#003A8C', 0.85, 4);
        }
      } else {
        // DISPATCHER WORKSPACE - Multi-Driver fleet tracking
        deliveries.forEach((item, index) => {
          let markerColor = item.priority === 'High' ? '#EF4444' : '#10B981';
          if (item.status === 'Completed') {
            markerColor = '#6B7280';
          }
          
          const isAssignedToSelected = selectedDriverName && item.assignedDriver === selectedDriverName;
          const isLocatingTarget = mapTargetDelivery?._id === item._id;

          let opacity = 1.0;
          if (selectedDriverName && !isAssignedToSelected) {
            opacity = 0.25;
          }

          const dMarker = new google.maps.Marker({
            position: { lat: item.latitude, lng: item.longitude },
            map: googleMap,
            title: item.customerName,
            opacity: opacity,
            icon: {
              url: `data:image/svg+xml;utf-8,${encodeURIComponent(getSvgPin(isLocatingTarget ? '#C9A227' : markerColor, String(index + 1)))}`,
              anchor: new google.maps.Point(15, 38),
            },
            animation: isLocatingTarget ? google.maps.Animation.BOUNCE : null
          });

          const popupContent = `
            <div style="font-family: Inter, sans-serif; padding: 10px; max-width: 220px; color:#1e293b;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:10px;font-weight:bold;color:#fff;background:${markerColor};padding:2px 6px;border-radius:4px;">Stop ${index + 1}</span>
                <span style="font-size:10px;font-weight:700;color:${item.priority === 'High' ? '#EF4444' : '#10B981'}">${item.priority} Priority</span>
              </div>
              <h4 style="margin: 0 0 5px 0; color: #003A8C; font-weight: 800; font-size: 13px;">${item.customerName}</h4>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Assigned Driver:</b> <span style="font-weight: bold; color: #003A8C;">${item.assignedDriver || 'Unassigned'}</span></p>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Address:</b> ${item.deliveryAddress}</p>
              <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Status:</b> <span style="font-weight: bold; color: ${item.status === 'Completed' ? '#6B7280' : '#003A8C'}">${item.status}</span></p>
            </div>
          `;

          const info = new google.maps.InfoWindow({ content: popupContent });
          dMarker.addListener('click', () => info.open(googleMap, dMarker));
          googleMarkersRef.current.push(dMarker);
          bounds.extend({ lat: item.latitude, lng: item.longitude });
        });

        // Plot drivers
        drivers.forEach((d) => {
          const isSelected = selectedDriverName === d.name;
          const opacity = selectedDriverName ? (isSelected ? 1.0 : 0.25) : 1.0;
          const driverMarker = new google.maps.Marker({
            position: { lat: d.lat, lng: d.lng },
            map: googleMap,
            title: `${d.name} (${d.status})`,
            opacity: opacity,
            icon: {
              url: `data:image/svg+xml;utf-8,${encodeURIComponent(getVehiclePin(d.color, d.label))}`,
              anchor: new google.maps.Point(17, 42),
            },
            zIndex: isSelected ? 2000 : 1000
          });

          driverMarker.addListener('click', () => {
            setSelectedDriverName(d.name);
          });
          googleMarkersRef.current.push(driverMarker);
          bounds.extend({ lat: d.lat, lng: d.lng });

          // Draw active path polyline for this driver
          const driverRoute = deliveries
            .filter((item) => item.assignedDriver === d.name)
            .sort((a, b) => (a.routeSequence || 99) - (b.routeSequence || 99));

          if (driverRoute.length > 0) {
            const routePoints = [
              warehouseLoc,
              ...driverRoute.map((item) => ({ lat: item.latitude, lng: item.longitude })),
              warehouseLoc
            ];

            const opacity = selectedDriverName ? (isSelected ? 0.95 : 0.1) : 0.5;
            drawGooglePolyline(routePoints, d.color, opacity, isSelected ? 5 : 3);
          }
        });

        if (selectedDriverName) {
          const activeDriver = drivers.find(d => d.name === selectedDriverName);
          if (activeDriver) {
            googleMap.setCenter({ lat: activeDriver.lat, lng: activeDriver.lng });
          }
        } else if (!mapTargetDelivery) {
          googleMap.fitBounds(bounds);
        }
      }

      if (mapTargetDelivery) {
        googleMap.setCenter({ lat: mapTargetDelivery.latitude, lng: mapTargetDelivery.longitude });
        googleMap.setZoom(14);
      }
    } else if (mapEngine === 'leaflet' && leafletMap) {
      const L = (window as any).L;

      leafletMarkersRef.current.forEach(m => leafletMap.removeLayer(m));
      leafletMarkersRef.current = [];
      leafletPolylinesRef.current.forEach(p => leafletMap.removeLayer(p));
      leafletPolylinesRef.current = [];

      const latLngs: any[] = [];

      const getLeafletIcon = (color: string, label: string) => {
        return L.divIcon({
          html: getSvgPin(color, label),
          className: 'leaflet-custom-marker',
          iconSize: [30, 38],
          iconAnchor: [15, 38],
          popupAnchor: [0, -32]
        });
      };

      const getLeafletVehicleIcon = (color: string, label: string) => {
        return L.divIcon({
          html: getVehiclePin(color, label),
          className: 'leaflet-custom-vehicle',
          iconSize: [34, 42],
          iconAnchor: [17, 42],
          popupAnchor: [0, -36]
        });
      };

      // Warehouse
      const whMarker = L.marker([warehouseLoc.lat, warehouseLoc.lng], {
        icon: getLeafletIcon('#003A8C', '🏠'),
        title: 'Warehouse Base'
      }).addTo(leafletMap);
      whMarker.bindPopup('<b style="color:#003A8C;">Warehouse Base</b><br/>Al Quoz Industrial, Dubai');
      leafletMarkersRef.current.push(whMarker);
      latLngs.push([warehouseLoc.lat, warehouseLoc.lng]);

      if (user?.role === 'Driver') {
        const activeRoute = isOptimized ? optimizedRoute : deliveries;

        activeRoute.forEach((item, index) => {
          let markerColor = item.priority === 'High' ? '#EF4444' : '#10B981';
          if (item.status === 'Completed') {
            markerColor = '#6B7280';
          }

          const isLocatingTarget = mapTargetDelivery?._id === item._id;

          const dMarker = L.marker([item.latitude, item.longitude], {
            icon: getLeafletIcon(isLocatingTarget ? '#C9A227' : markerColor, String(index + 1)),
            title: item.customerName
          }).addTo(leafletMap);

          const popupContent = `
            <div style="font-family: Inter, sans-serif; padding: 4px; max-width: 200px; color:#1e293b;">
              <b style="color:#003A8C; font-size:12px;">${item.customerName}</b><br/>
              <span style="font-size:10px;color:#64748B;"><b>Address:</b> ${item.deliveryAddress}</span><br/>
              <span style="font-size:10px;color:#64748B;"><b>Phone:</b> ${item.phoneNumber}</span><br/>
              <span style="font-size:10px;color:#64748B;"><b>Status:</b> ${item.status}</span><br/>
              <span style="font-size:10px;font-weight:700;color:${item.priority === 'High' ? '#EF4444' : '#10B981'}">${item.priority} Priority</span>
            </div>
          `;
          dMarker.bindPopup(popupContent);
          leafletMarkersRef.current.push(dMarker);
          latLngs.push([item.latitude, item.longitude]);
        });

        if (currentDriverPos) {
          const vehicleMarker = L.marker([currentDriverPos.lat, currentDriverPos.lng], {
            icon: getLeafletIcon('#D4AF37', '🚚'),
            title: 'Current Driver Position',
            zIndexOffset: 1000
          }).addTo(leafletMap);
          leafletMarkersRef.current.push(vehicleMarker);
          latLngs.push([currentDriverPos.lat, currentDriverPos.lng]);

          if (isSimulating) {
            leafletMap.setView([currentDriverPos.lat, currentDriverPos.lng]);
          }
        }

        if (isOptimized && activeRoute.length > 0) {
          const pathPoints: [number, number][] = [
            [warehouseLoc.lat, warehouseLoc.lng],
            ...activeRoute.map(item => [item.latitude, item.longitude] as [number, number]),
            [warehouseLoc.lat, warehouseLoc.lng]
          ];
          drawLeafletPolyline(pathPoints, '#003A8C', 0.85, 4);
        }
      } else {
        // DISPATCHER WORKSPACE - Leaflet
        deliveries.forEach((item, index) => {
          let markerColor = item.priority === 'High' ? '#EF4444' : '#10B981';
          if (item.status === 'Completed') {
            markerColor = '#6B7280';
          }
          
          const isAssignedToSelected = selectedDriverName && item.assignedDriver === selectedDriverName;
          const isLocatingTarget = mapTargetDelivery?._id === item._id;

          let opacity = 1.0;
          if (selectedDriverName && !isAssignedToSelected) opacity = 0.3;

          const dMarker = L.marker([item.latitude, item.longitude], {
            icon: getLeafletIcon(isLocatingTarget ? '#C9A227' : markerColor, String(index + 1)),
            title: item.customerName,
            opacity: opacity
          }).addTo(leafletMap);

          const popupContent = `
            <div style="font-family: Inter, sans-serif; padding: 4px; max-width: 200px; color:#1e293b;">
              <b style="color:#003A8C; font-size:12px;">${item.customerName}</b><br/>
              <span style="font-size:10px;color:#64748B;"><b>Driver:</b> ${item.assignedDriver || 'Unassigned'}</span><br/>
              <span style="font-size:10px;color:#64748B;"><b>Address:</b> ${item.deliveryAddress}</span><br/>
              <span style="font-size:10px;color:#64748B;"><b>Status:</b> ${item.status}</span>
            </div>
          `;
          dMarker.bindPopup(popupContent);
          leafletMarkersRef.current.push(dMarker);
          latLngs.push([item.latitude, item.longitude]);
        });

        // Plot drivers
        drivers.forEach((d) => {
          const isSelected = selectedDriverName === d.name;
          const opacity = selectedDriverName ? (isSelected ? 1.0 : 0.25) : 1.0;
          const driverMarker = L.marker([d.lat, d.lng], {
            icon: getLeafletVehicleIcon(d.color, d.label),
            title: d.name,
            opacity: opacity,
            zIndexOffset: isSelected ? 2000 : 1000
          }).addTo(leafletMap);

          driverMarker.on('click', () => {
            setSelectedDriverName(d.name);
          });
          leafletMarkersRef.current.push(driverMarker);
          latLngs.push([d.lat, d.lng]);

          const driverRoute = deliveries
            .filter((item) => item.assignedDriver === d.name)
            .sort((a, b) => (a.routeSequence || 99) - (b.routeSequence || 99));

          if (driverRoute.length > 0) {
            const routePoints: [number, number][] = [
              [warehouseLoc.lat, warehouseLoc.lng],
              ...driverRoute.map((item) => [item.latitude, item.longitude] as [number, number]),
              [warehouseLoc.lat, warehouseLoc.lng]
            ];

            const opacity = selectedDriverName ? (isSelected ? 0.95 : 0.1) : 0.5;
            drawLeafletPolyline(routePoints, d.color, opacity, isSelected ? 5 : 3);
          }
        });

        if (selectedDriverName) {
          const activeDriver = drivers.find(d => d.name === selectedDriverName);
          if (activeDriver) {
            leafletMap.setView([activeDriver.lat, activeDriver.lng]);
          }
        } else if (!mapTargetDelivery && latLngs.length > 0) {
          leafletMap.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
        }
      }

      if (mapTargetDelivery) {
        leafletMap.setView([mapTargetDelivery.latitude, mapTargetDelivery.longitude], 14);
      }
    }
  }, [googleMap, leafletMap, mapEngine, optimizedRoute, isOptimized, deliveries, mapTargetDelivery, driverPos, trackingData, isSimulating, drivers, selectedDriverName, user]);

  // Filtering & Search
  const filteredDeliveries = deliveries.filter((item) => {
    const matchesSearch = 
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.deliveryAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.phoneNumber.includes(searchTerm);
    
    const matchesPriority = filterPriority === 'All' || item.priority === filterPriority;
    const matchesStatus = filterStatus === 'All' || item.status === filterStatus;

    return matchesSearch && matchesPriority && matchesStatus;
  });

  // Sorting
  const sortedDeliveries = [...filteredDeliveries].sort((a, b) => {
    let aVal: any = a[sortBy as keyof DeliveryOrder];
    let bVal: any = b[sortBy as keyof DeliveryOrder];

    if (aVal === undefined) return 1;
    if (bVal === undefined) return -1;

    if (typeof aVal === 'string') {
      return sortOrder === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }
    
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Pagination
  const totalPages = Math.ceil(sortedDeliveries.length / entriesPerPage);
  const indexOfLastEntry = currentPage * entriesPerPage;
  const indexOfFirstEntry = indexOfLastEntry - entriesPerPage;
  const currentEntries = sortedDeliveries.slice(indexOfFirstEntry, indexOfLastEntry);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Helper Stats Counts
  const totalCount = deliveries.length;
  const completedCount = deliveries.filter(d => d.status === 'Completed').length;
  const pendingCount = totalCount - completedCount;
  const highPriorityCount = deliveries.filter(d => d.priority === 'High' && d.status !== 'Completed').length;

  const renderProgressBarStr = (completed: number, total: number) => {
    const ratio = total > 0 ? completed / total : 0;
    const percentage = Math.round(ratio * 100);
    const totalBlocks = 18;
    const filledBlocks = Math.round(ratio * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    return { bar, percentage };
  };

  // DISPATCHER DASHBOARD LAYOUT
  const renderDispatcherDashboard = () => {
    const { bar, percentage } = renderProgressBarStr(completedCount, totalCount);

    return (
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#003A8C] tracking-tight">
              Dispatcher Dashboard
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Monitor active delivery progress, view optimized route sequences, and track execution live.
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleResetDemo}
              disabled={refreshing}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="Reset all dispatches status back to Pending"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Reset State</span>
            </button>

            <button
              onClick={() => {
                setMapTargetDelivery(null);
                setIsMapModalOpen(true);
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#003A8C] text-[#D4AF37] rounded-xl text-xs font-bold tracking-wider hover:bg-[#002B70] shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer border border-[#D4AF37]/30 hover:-translate-y-0.5"
            >
              <Map className="h-4.5 w-4.5" />
              <span>SHOW ALL DRIVERS ON MAP</span>
            </button>
          </div>
        </div>

        {/* Operational Metrics Cards Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100/80 flex items-center gap-4">
            <div className="p-3 bg-[#003A8C]/5 text-[#003A8C] rounded-xl">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Total Deliveries</span>
              <span className="text-2xl font-black text-slate-800">{totalCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100/80 flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl">
              <CheckCircle2 className="h-5 w-5 fill-green-50" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Completed</span>
              <span className="text-2xl font-black text-slate-800">{completedCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100/80 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <RefreshCw className="h-5 w-5 animate-spin-slow" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Pending</span>
              <span className="text-2xl font-black text-slate-800">{pendingCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100/80 flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <AlertTriangle className="h-5 w-5 fill-red-50" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">High Priority</span>
              <span className="text-2xl font-black text-slate-800">{highPriorityCount}</span>
            </div>
          </div>
        </div>

        {/* Live Progress Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#001F5B] to-[#003A8C] text-white p-6 rounded-[24px] shadow-lg border border-[#D4AF37]/20 lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] block font-sans">Route Progress</span>
                  <h3 className="text-lg font-black mt-0.5">Live Delivery Track</h3>
                </div>
                <span className="text-2xl font-extrabold text-[#D4AF37]">{percentage}%</span>
              </div>
              
              <div className="font-mono text-base tracking-widest text-[#D4AF37] bg-black/20 p-3.5 rounded-xl border border-white/5 mb-4">
                {bar}
              </div>
              <p className="text-xs text-white/80 font-semibold">
                {completedCount} / {totalCount} Deliveries Completed
              </p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/10 text-xs">
              <div>
                <span className="text-white/60 block font-semibold">Current Stop</span>
                <span className="font-bold text-[#D4AF37] truncate block mt-0.5" title={trackingData?.currentStopName || 'N/A'}>
                  {trackingData?.isActive ? trackingData?.currentStopName : 'Warehouse'}
                </span>
              </div>
              <div>
                <span className="text-white/60 block font-semibold">Next Stop</span>
                <span className="font-bold text-[#D4AF37] truncate block mt-0.5" title={trackingData?.nextStopName || 'N/A'}>
                  {trackingData?.isActive ? (trackingData?.nextStopName || 'Warehouse') : 'Warehouse'}
                </span>
              </div>
              <div>
                <span className="text-white/60 block font-semibold">Live ETA</span>
                <span className="font-bold text-[#D4AF37] block mt-0.5">
                  {trackingData?.isActive ? trackingData?.eta : 'Calculating...'}
                </span>
              </div>
              <div>
                <span className="text-white/60 block font-semibold">Driver Location</span>
                <span className="font-bold text-[#D4AF37] block mt-0.5 truncate">
                  {trackingData?.isActive ? `${trackingData?.driverLatitude.toFixed(4)}, ${trackingData?.driverLongitude.toFixed(4)}` : 'At Base'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Fleet Optimization</span>
              <h3 className="text-base font-extrabold text-[#003A8C] mt-0.5">Smart Router Status</h3>
              
              <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex justify-between text-xs font-semibold mb-2">
                  <span className="text-slate-500">Route Optimization:</span>
                  <span className={isOptimized ? 'text-green-600 font-bold' : 'text-amber-600 font-bold'}>
                    {isOptimized ? 'OPTIMIZED' : 'PENDING'}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-500">Session Status:</span>
                  <span className={trackingData?.isActive ? 'text-blue-600 font-bold' : 'text-slate-500'}>
                    {trackingData?.isActive ? 'LIVE SESSION RUNNING' : 'IDLE'}
                  </span>
                </div>
                {isOptimized && analytics && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                    <div>
                      <span className="text-slate-400 block uppercase font-sans">Distance</span>
                      <span className="text-slate-700 font-black">{analytics.totalDistance} km</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-sans">Est. Time</span>
                      <span className="text-slate-700 font-black">{analytics.travelTime}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className={`text-center text-xs font-bold py-3 rounded-xl border ${
                isOptimized
                  ? 'text-green-600 bg-green-50 border-green-100'
                  : 'text-slate-500 bg-slate-50 border-slate-200'
              }`}>
                {isOptimized ? '✓ Route Optimized & Synchronized' : 'Route auto-optimized when driver starts session'}
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Delivery Table Container */}
        <div className="bg-white rounded-[24px] shadow-[0_20px_50px_-15px_rgba(0,31,91,0.05)] border border-slate-100/80 overflow-hidden">
          
          {/* Bulk Driver Assignment Bar */}
          {selectedDeliveryIds.length > 0 && (
            <div className="bg-[#001F5B] text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-[#D4AF37]/30 animate-fade-in relative z-30">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  {selectedDeliveryIds.length} deliveries selected for allocation
                </span>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto relative">
                <span className="text-xs text-slate-300 font-semibold hidden md:inline">Assign Driver:</span>
                
                {/* Searchable dropdown trigger for bulk action */}
                <div className="relative w-full sm:w-60">
                  <button
                    onClick={() => {
                      if (activeDropdownRowId === 'bulk') {
                        setActiveDropdownRowId(null);
                      } else {
                        setActiveDropdownRowId('bulk');
                        setDriverSearchQuery('');
                      }
                    }}
                    className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-[#D4AF37] rounded-xl text-xs font-bold tracking-wider transition-all flex items-center justify-between cursor-pointer"
                  >
                    <span>Choose Driver...</span>
                    <span className="text-[10px] text-[#D4AF37]">▼</span>
                  </button>

                  {activeDropdownRowId === 'bulk' && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownRowId(null);
                        }}
                      />
                      <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-20 overflow-hidden text-slate-800 text-left">
                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                          <input
                            type="text"
                            placeholder="Search drivers..."
                            value={driverSearchQuery}
                            onChange={(e) => setDriverSearchQuery(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {DRIVERS.filter(d => d.name.toLowerCase().includes(driverSearchQuery.toLowerCase())).map((d) => {
                            const workload = getDriverWorkload(d.name);
                            const currentDriverState = drivers.find(drv => drv.name === d.name);
                            const isOffline = currentDriverState?.status === 'Offline' || currentDriverState?.status === 'Shift Completed';

                            return (
                              <button
                                key={d.name}
                                onClick={() => {
                                  handleAssignDriver(selectedDeliveryIds, d.name);
                                }}
                                className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-0 transition-colors ${
                                  isOffline ? 'opacity-60' : ''
                                }`}
                              >
                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                  <span className="truncate">{d.name}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pl-4">
                                  <span>Workload: {workload} active stops</span>
                                  <span className="text-[9px]" style={{ color: getStatusColor(currentDriverState?.status || '') }}>
                                    {currentDriverState?.status || 'Offline'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}

                          <button
                            onClick={() => {
                              handleAssignDriver(selectedDeliveryIds, 'Unassigned');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-bold text-xs border-t border-slate-100 flex items-center gap-1.5 transition-colors text-slate-800"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                            <span>Remove Driver</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => setSelectedDeliveryIds([])}
                  className="px-3.5 py-2 bg-transparent hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table Filters Actions Bar */}
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-[#003A8C]" />
              <input
                type="text"
                placeholder="Search customer, address, or telephone number..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/10 focus:border-[#D4AF37]"
              />
            </div>

            {/* Filter Group */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-[#003A8C]" />
                <span className="text-xs font-semibold text-slate-600">Priority:</span>
                <select
                  value={filterPriority}
                  onChange={(e) => {
                    setFilterPriority(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                >
                  <option value="All">All Priorities</option>
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actual Deliveries Data Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-20 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-[#003A8C]" />
                <p className="text-slate-500 font-medium">Loading Landmark Route orders...</p>
              </div>
            ) : currentEntries.length === 0 ? (
              <div className="text-center py-20">
                <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-bold">No dispatches found matching the current criteria.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-100 font-semibold text-xs uppercase tracking-wider font-sans">
                    <th className="py-4 px-4 text-center w-12">
                      <input 
                        type="checkbox"
                        checked={currentEntries.length > 0 && currentEntries.every(e => selectedDeliveryIds.includes(e._id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newSelected = [...selectedDeliveryIds];
                            currentEntries.forEach(item => {
                              if (!newSelected.includes(item._id)) {
                                newSelected.push(item._id);
                              }
                            });
                            setSelectedDeliveryIds(newSelected);
                          } else {
                            const idsToRemove = currentEntries.map(e => e._id);
                            setSelectedDeliveryIds(selectedDeliveryIds.filter(id => !idsToRemove.includes(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-[#003A8C] focus:ring-[#D4AF37] h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-6">Sequence</th>
                    <th 
                      onClick={() => handleSort('customerName')} 
                      className="py-4 px-6 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                    >
                      Customer Name {sortBy === 'customerName' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6">Phone Number</th>
                    <th 
                      onClick={() => handleSort('deliveryAddress')} 
                      className="py-4 px-6 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                    >
                      Delivery Address {sortBy === 'deliveryAddress' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th 
                      onClick={() => handleSort('priority')} 
                      className="py-4 px-6 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                    >
                      Priority {sortBy === 'priority' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Completed At</th>
                    <th className="py-4 px-6">Drivers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentEntries.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <input 
                          type="checkbox"
                          checked={selectedDeliveryIds.includes(item._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeliveryIds([...selectedDeliveryIds, item._id]);
                            } else {
                              setSelectedDeliveryIds(selectedDeliveryIds.filter(id => id !== item._id));
                            }
                          }}
                          className="rounded border-slate-300 text-[#003A8C] focus:ring-[#D4AF37] h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-500 font-bold">
                        {item.routeSequence ? `Stop ${item.routeSequence}` : 'Unsequenced'}
                      </td>
                      <td className="py-3.5 px-6 font-extrabold text-slate-800">{item.customerName}</td>
                      <td className="py-3.5 px-6 font-medium text-slate-500">{item.phoneNumber}</td>
                      <td className="py-3.5 px-6 text-slate-600 font-medium max-w-[240px] truncate" title={item.deliveryAddress}>
                        {item.deliveryAddress}
                      </td>
                      <td className="py-3.5 px-6">
                        {item.priority === 'High' ? (
                          <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg text-xs font-bold border border-red-100">
                            High
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        {item.status === 'Completed' ? (
                          <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 w-max">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Completed
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-amber-100 flex items-center gap-1.5 w-max">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-500 font-semibold">
                        {item.completedAt ? formatCompletedTime(item.completedAt.toString()) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-6 relative">
                        <div className="relative inline-block text-left">
                          <button
                            onClick={() => {
                              if (activeDropdownRowId === item._id) {
                                setActiveDropdownRowId(null);
                              } else {
                                setActiveDropdownRowId(item._id);
                                setDriverSearchQuery('');
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 border w-44 cursor-pointer hover:shadow-sm ${
                              item.assignedDriver 
                                ? 'bg-white border-slate-200 text-slate-800 shadow-sm'
                                : 'bg-[#003A8C]/5 hover:bg-[#003A8C]/15 border-transparent text-[#003A8C]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {item.assignedDriver ? (
                                <>
                                  <span 
                                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0" 
                                    style={{ backgroundColor: DRIVERS.find(d => d.name === item.assignedDriver)?.color || '#94A3B8' }}
                                  />
                                  <span className="truncate">{item.assignedDriver}</span>
                                </>
                              ) : (
                                <span>Select Driver</span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-400">▼</span>
                          </button>

                          {activeDropdownRowId === item._id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdownRowId(null);
                                }}
                              />
                              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden text-slate-800 text-left animate-fade-in-down">
                                <div className="p-2 border-b border-slate-100 bg-slate-50">
                                  <input
                                    type="text"
                                    placeholder="Search drivers..."
                                    value={driverSearchQuery}
                                    onChange={(e) => setDriverSearchQuery(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="max-h-56 overflow-y-auto py-1">
                                  {DRIVERS.filter(d => d.name.toLowerCase().includes(driverSearchQuery.toLowerCase())).map((d) => {
                                    const workload = getDriverWorkload(d.name);
                                    const recDriver = getRecommendedDriver(item.latitude, item.longitude);
                                    const isRecommended = recDriver === d.name;
                                    const currentDriverState = drivers.find(drv => drv.name === d.name);
                                    const isOffline = currentDriverState?.status === 'Offline' || currentDriverState?.status === 'Shift Completed';

                                    return (
                                      <button
                                        key={d.name}
                                        onClick={() => handleAssignDriver([item._id], d.name)}
                                        className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-0 transition-colors cursor-pointer ${
                                          isOffline ? 'opacity-65' : ''
                                        }`}
                                      >
                                        <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-1.5 font-bold text-xs truncate">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                            <span className="truncate">{d.name}</span>
                                          </div>
                                          {isRecommended && (
                                            <span className="text-[9px] font-black text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.5 rounded border border-[#D4AF37]/20 uppercase shrink-0">
                                              Rec
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pl-4">
                                          <span>Workload: {workload} active stops</span>
                                          <span className="text-[9px]" style={{ color: getStatusColor(currentDriverState?.status || '') }}>
                                            {currentDriverState?.status || 'Offline'}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                  
                                  {item.assignedDriver && (
                                    <button
                                      onClick={() => handleAssignDriver([item._id], 'Unassigned')}
                                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-bold text-xs border-t border-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer text-slate-850"
                                    >
                                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                                      <span>Remove Driver</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Pagination Footer */}
          {!loading && totalPages > 1 && (
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Showing {indexOfFirstEntry + 1} to {Math.min(indexOfLastEntry, sortedDeliveries.length)} of {sortedDeliveries.length} deliveries
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {Array.from({ length: totalPages }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(idx + 1)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      currentPage === idx + 1
                        ? 'bg-[#003A8C] text-white'
                        : 'border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  };

  // DRIVER DASHBOARD LAYOUT
  const renderDriverDashboard = () => {
    const pendingDeliveries = deliveries.filter(d => d.status !== 'Completed');
    
    return (
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#003A8C] tracking-tight">
            Driver Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            View optimized route sequence, start live tracking session, and automatically update delivery progress.
          </p>
        </div>

        {/* Start Route Session Card */}
        <div className="bg-white rounded-[24px] shadow-sm border border-slate-100/80 p-8 text-center mb-8 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-[#D4AF37]" />
          
          <div className="h-16 w-16 bg-[#003A8C]/5 text-[#003A8C] rounded-full flex items-center justify-center mx-auto mb-4">
            <Truck className="h-8 w-8 text-[#003A8C]" />
          </div>

          <h2 className="text-xl font-extrabold text-[#003A8C] mb-2">Assigned Dispatch Route Session</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            There are <b className="text-slate-800 font-bold">{deliveries.length} orders</b> loaded. 
            {isOptimized ? ' Route is pre-optimized. Click Let\'s Go to begin your session.' : ' Click Let\'s Go to automatically optimize the route and begin.'}
          </p>

          <div className="flex justify-center gap-8 text-xs font-semibold mb-8 max-w-sm mx-auto bg-slate-50/80 border border-slate-100 p-4 rounded-2xl">
            <div>
              <span className="text-slate-400 block">STOPS</span>
              <span className="text-lg font-black text-slate-800">{deliveries.length}</span>
            </div>
            <div className="border-l border-slate-200" />
            <div>
              <span className="text-slate-400 block">PENDING</span>
              <span className="text-lg font-black text-amber-600">{pendingDeliveries.length}</span>
            </div>
            <div className="border-l border-slate-200" />
            <div>
              <span className="text-slate-400 block">COMPLETED</span>
              <span className="text-lg font-black text-green-600">{completedCount}</span>
            </div>
          </div>

          {/* LET'S GO PRIMARY ACTION BUTTON */}
          {!isSimulating ? (
            <button
              onClick={handleStartRoute}
              className="w-full max-w-md mx-auto py-5 bg-[#003A8C] text-[#D4AF37] text-lg font-extrabold tracking-widest uppercase rounded-2xl shadow-xl shadow-[#003A8C]/10 hover:shadow-[0_0_30px_rgba(212,175,55,0.65)] transition-all duration-300 transform hover:-translate-y-1 hover:brightness-110 active:translate-y-0 cursor-pointer border border-[#D4AF37] flex items-center justify-center gap-3"
            >
              🚚&nbsp;&nbsp;LET'S GO
            </button>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 max-w-md mx-auto flex items-center justify-between shadow-sm animate-pulse">
              <div className="text-left">
                <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider">Session Active</span>
                <span className="text-sm font-extrabold text-slate-800">Vehicle is in Transit</span>
              </div>
              <button
                onClick={() => setIsMapModalOpen(true)}
                className="px-4 py-2 bg-[#003A8C] text-[#D4AF37] rounded-xl text-xs font-extrabold hover:bg-[#002B70] transition-colors border border-[#D4AF37]/35 cursor-pointer"
              >
                OPEN MAP
              </button>
            </div>
          )}
        </div>

        {/* Stops Listing */}
        <div className="bg-white rounded-[24px] shadow-sm border border-slate-100/80 p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 block">Route Stops Sequence</h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
              <span className="w-6 h-6 rounded-full bg-[#003A8C] text-white font-bold flex items-center justify-center">W</span>
              <span className="font-bold text-slate-700">Warehouse Base (Al Quoz Industrial)</span>
            </div>

            <div className="relative pl-3 border-l-2 border-slate-100 space-y-3 ml-3">
              {deliveries.map((item, idx) => {
                const isCurrent = pendingDeliveries[0]?._id === item._id;
                const isCompleted = item.status === 'Completed';

                return (
                  <div 
                    key={item._id} 
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-xs ${
                      isCurrent 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-sm ring-1 ring-[#D4AF37]/20 scale-[1.01]' 
                        : isCompleted
                          ? 'border-slate-100 bg-slate-50/50 opacity-60'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full font-bold flex items-center justify-center ${
                        isCurrent 
                          ? 'bg-[#D4AF37] text-white animate-pulse'
                          : isCompleted
                            ? 'bg-slate-300 text-slate-500'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-800">{item.customerName}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[300px] sm:max-w-md">{item.deliveryAddress}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.priority === 'High' && !isCompleted && (
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">
                          High
                        </span>
                      )}
                      {isCompleted ? (
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Delivered</span>
                      ) : isCurrent ? (
                        <span className="text-[#003A8C] font-extrabold uppercase text-[9px] tracking-wider animate-pulse flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#003A8C]" />
                          In Transit
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
              <span className="w-6 h-6 rounded-full bg-[#003A8C] text-white font-bold flex items-center justify-center">W</span>
              <span className="font-bold text-slate-700">End: Return to Warehouse Base</span>
            </div>
          </div>
        </div>
      </main>
    );
  };

  // FULLSCREEN MAP MODAL LAYOUT
  const renderMapModal = () => {
    if (!isMapModalOpen) return null;

    const pendingDeliveries = deliveries.filter(d => d.status !== 'Completed');
    const activeRoute = isOptimized ? optimizedRoute : deliveries;
    const currentTargetStop = pendingDeliveries[0] || null;

    // Dispatcher statistics for Control Panel
    const activeDriversCount = drivers.filter(d => d.status === 'On Route' || d.status === 'Near Delivery Point').length;
    const availableDriversCount = drivers.filter(d => d.status === 'Available').length;
    const deliveriesInProgressCount = deliveries.filter(d => d.status === 'Assigned' || d.status === 'In Transit').length;
    const completedDeliveriesCount = deliveries.filter(d => d.status === 'Completed').length;

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden border border-slate-100">
          
          {/* Dispatcher Control Panel / Stats Header (For Dispatcher / Admin) */}
          {(user?.role === 'Dispatcher' || user?.role === 'Admin') ? (
            <div className="bg-[#003A8C] text-white border-b-2 border-[#D4AF37] px-6 py-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0 shadow-md">
              <div>
                <h3 className="text-sm font-black tracking-wider text-[#D4AF37] uppercase">Fleet Control Console</h3>
                <p className="text-[10px] text-slate-300 font-semibold mt-0.5">Live Real-Time Fleet Tracking & Operations</p>
              </div>
              
              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-4 lg:gap-8 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Total Drivers:</span>
                  <span className="bg-white/10 px-2 py-0.5 rounded text-white font-extrabold">{drivers.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Active Drivers:</span>
                  <span className="bg-blue-500/20 text-[#D4AF37] px-2 py-0.5 rounded border border-blue-500/30 font-extrabold">
                    {activeDriversCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Available Drivers:</span>
                  <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-extrabold">
                    {availableDriversCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Deliveries In Progress:</span>
                  <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 font-extrabold">
                    {deliveriesInProgressCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Completed Deliveries:</span>
                  <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30 font-extrabold">
                    {completedDeliveriesCount}
                  </span>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  setIsMapModalOpen(false);
                  setMapTargetDelivery(null);
                  setSelectedDriverName(null);
                  setForceLeaflet(false);
                  setGoogleMapsError(null);
                }}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer shrink-0 lg:ml-4"
                title="Close Panel"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          ) : (
            // Simple Header for Driver Portal
            <div className="bg-[#003A8C] text-white border-b-2 border-[#D4AF37] px-6 py-4 flex justify-between items-center shrink-0 shadow-md">
              <div>
                <h3 className="text-sm font-black tracking-wider text-[#D4AF37] uppercase">Driver Navigation Map</h3>
                <p className="text-[10px] text-slate-300 font-semibold mt-0.5">Real-Time Routing & Live Proximity Status</p>
              </div>
              <button
                onClick={() => {
                  setIsMapModalOpen(false);
                  setMapTargetDelivery(null);
                  setForceLeaflet(false);
                  setGoogleMapsError(null);
                }}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer shrink-0"
                title="Close Panel"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          )}

          {/* Main Map + Sidebar Content Area */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            
            {/* Map Canvas OR Fallback Diagnostics Panel */}
            <div className="flex-1 relative h-[50vh] md:h-auto overflow-hidden">
              {mapEngine === 'leaflet' && googleMapsError && (
                <div className="absolute top-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-amber-500/30 text-xs text-slate-200 flex items-center gap-3 max-w-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shrink-0">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-[11px] text-amber-400 uppercase tracking-wide">Leaflet Fallback Active</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                      Google Maps load failed ({googleMapsError.code}). Operating in OpenStreetMap fallback mode.
                    </p>
                  </div>
                  <button 
                    onClick={() => setGoogleMapsError(null)}
                    className="text-slate-500 hover:text-slate-200 transition-colors p-1 text-sm font-bold cursor-pointer"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div 
                ref={mapContainerRef} 
                className="w-full h-full bg-slate-100" 
                id="map-container"
              />
              
              {/* Custom map controls overlay */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-md border border-slate-100">
                <button
                  onClick={() => {
                    if (mapEngine === 'google' && googleMap) {
                      googleMap.setZoom(googleMap.getZoom() + 1);
                    } else if (mapEngine === 'leaflet' && leafletMap) {
                      leafletMap.zoomIn();
                    }
                  }}
                  className="p-2 hover:bg-slate-100 text-[#003A8C] rounded-lg transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <Maximize2 className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => {
                    if (mapEngine === 'google' && googleMap) {
                      googleMap.setZoom(googleMap.getZoom() - 1);
                    } else if (mapEngine === 'leaflet' && leafletMap) {
                      leafletMap.zoomOut();
                    }
                  }}
                  className="p-2 hover:bg-slate-100 text-[#003A8C] rounded-lg transition-colors border-t border-slate-100 cursor-pointer"
                  title="Zoom Out"
                >
                  <Minimize2 className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => setSatelliteView(!satelliteView)}
                  className={`p-2 rounded-lg transition-colors border-t border-slate-100 cursor-pointer ${
                    satelliteView ? 'bg-[#003A8C]/15 text-[#003A8C]' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                  title="Toggle Satellite View"
                >
                  <Layers className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => setShowTraffic(!showTraffic)}
                  className={`p-2 rounded-lg transition-colors border-t border-slate-100 cursor-pointer ${
                    showTraffic ? 'bg-[#003A8C]/15 text-[#003A8C]' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                  title="Toggle Traffic Layer"
                >
                  <Compass className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Map engine tag */}
              <div className="absolute bottom-4 left-4 z-10 bg-white/95 px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Engine: <span className={mapEngine === 'google' ? 'text-[#003A8C]' : 'text-emerald-600'}>{mapEngine} Maps</span>
              </div>

              {/* Close Modal Button (For Mobile/Simple layout where header isn't shown or extra safety) */}
              <button
                onClick={() => {
                  setIsMapModalOpen(false);
                  setMapTargetDelivery(null);
                  setSelectedDriverName(null);
                  setForceLeaflet(false);
                }}
                className="absolute top-4 right-4 z-10 p-2.5 bg-slate-900/60 hover:bg-slate-900/80 text-white rounded-full shadow-lg transition-all cursor-pointer hover:rotate-90 duration-300 md:hidden"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Arrived At Stop Prompt (For Driver Role) */}
              {user?.role === 'Driver' && isWaitingConfirmation && currentTargetStop && (
                <div className="absolute inset-x-4 bottom-24 md:bottom-6 z-25 max-w-sm mx-auto bg-white rounded-[20px] border-2 border-[#D4AF37] p-5 shadow-2xl animate-bounce text-slate-800">
                  <div className="text-center">
                    <div className="h-10 w-10 bg-amber-50 text-[#D4AF37] rounded-full flex items-center justify-center mx-auto mb-3 border border-[#D4AF37]/20">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <h4 className="text-base font-extrabold text-[#003A8C]">Arrived At Stop</h4>
                    <p className="text-xs text-slate-500 font-semibold mt-1 mb-4 leading-normal">
                      Delivery for <b className="text-slate-800 font-bold">{currentTargetStop.customerName}</b> is completed?
                    </p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmDelivery}
                        className="flex-1 py-3 bg-[#003A8C] text-[#D4AF37] font-bold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-[#003A8C]/15 hover:shadow-lg transition-all duration-200 cursor-pointer border border-[#D4AF37]"
                      >
                        Confirm Delivery
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Control Sidebar */}
            <div className="w-full md:w-[380px] bg-slate-50 border-l border-slate-100 flex flex-col justify-between h-[40vh] md:h-auto overflow-hidden">
              
              {/* Sidebar Header */}
              <div className="p-6 border-b border-slate-200/80 bg-white">
                <h3 className="text-lg font-black text-[#003A8C] tracking-tight">Dubai Routing Session</h3>
                <p className="text-xs text-slate-500 mt-1">Warehouse: Al Quoz Base &bull; Deliveries: {deliveries.length}</p>
                
                {mapTargetDelivery && (
                  <div className="mt-3 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded-xl text-xs">
                    <span className="font-bold text-[#003A8C] block mb-0.5">Locating Stop:</span>
                    <span className="font-semibold text-slate-700">{mapTargetDelivery.customerName} ({mapTargetDelivery.deliveryAddress})</span>
                  </div>
                )}
              </div>

              {/* Sidebar Contextual controls */}
              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                
                {/* Dispatcher Portal: Fleet overview or detailed driver tracking */}
                {(user?.role === 'Dispatcher' || user?.role === 'Admin') && (
                  selectedDriverName ? (
                    // DRIVER DETAILS PANEL & LIVE ROUTE VISIBILITY
                    (() => {
                      const driver = drivers.find(d => d.name === selectedDriverName);
                      if (!driver) return null;

                      const driverDeliveries = deliveries.filter(del => del.assignedDriver === driver.name);
                      const totalStops = driverDeliveries.length;
                      const completedStops = driverDeliveries.filter(del => del.status === 'Completed').length;
                      const pendingStops = totalStops - completedStops;
                      
                      const sortedDriverDeliveries = [...driverDeliveries].sort(
                        (a, b) => (a.routeSequence || 99) - (b.routeSequence || 99)
                      );
                      const nextStop = sortedDriverDeliveries.find(del => del.status !== 'Completed');

                      let etaStr = 'N/A';
                      if (nextStop) {
                        const dist = haversineDistance(driver.lat, driver.lng, nextStop.latitude, nextStop.longitude);
                        const mins = Math.round(dist * 1.5 + 1);
                        etaStr = `${dist.toFixed(1)} km (~${mins} mins)`;
                      } else if (totalStops > 0 && pendingStops === 0) {
                        etaStr = 'Returning to Warehouse';
                      }

                      return (
                        <div className="space-y-5">
                          {/* Back button */}
                          <button
                            onClick={() => setSelectedDriverName(null)}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#003A8C] hover:text-[#002B70] transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <span>Back to Fleet Overview</span>
                          </button>

                          {/* Driver Summary Card */}
                          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 inset-x-0 h-1.5" style={{ backgroundColor: driver.color }} />
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-base font-extrabold text-slate-800">{driver.name}</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{driver.vehicle} &bull; {driver.phone}</p>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold uppercase ${getStatusBadgeStyle(driver.status)}`}>
                                {driver.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-center">
                              <div className="bg-slate-50 p-2 rounded-xl">
                                <span className="text-[9px] text-slate-400 font-bold block uppercase">Assigned</span>
                                <span className="text-sm font-black text-slate-800">{totalStops}</span>
                              </div>
                              <div className="bg-emerald-50 p-2 rounded-xl">
                                <span className="text-[9px] text-emerald-600 font-bold block uppercase">Delivered</span>
                                <span className="text-sm font-black text-emerald-700">{completedStops}</span>
                              </div>
                              <div className="bg-amber-50 p-2 rounded-xl">
                                <span className="text-[9px] text-amber-600 font-bold block uppercase">Pending</span>
                                <span className="text-sm font-black text-amber-700">{pendingStops}</span>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2 text-xs text-slate-600">
                              <div className="flex justify-between font-semibold">
                                <span>Current Location:</span>
                                <span className="text-slate-800 font-bold">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Speed:</span>
                                <span className="text-slate-800 font-bold">{driver.speed} km/h</span>
                              </div>
                            </div>
                          </div>

                          {/* Route Details Panel */}
                          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                            <span className="font-extrabold text-slate-700 text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-2">Live Route Visibility</span>
                            
                            <div className="space-y-2.5 text-xs">
                              {nextStop ? (
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                  <span className="text-[#003A8C] font-extrabold block text-[10px] uppercase">Next Delivery</span>
                                  <span className="text-slate-800 font-extrabold block mt-0.5">{nextStop.customerName}</span>
                                  <span className="text-slate-400 font-bold block mt-0.5 truncate">{nextStop.deliveryAddress}</span>
                                  <span className="text-[#D4AF37] font-black block mt-2 text-[10px] uppercase tracking-wider">Estimated Arrival: {etaStr}</span>
                                </div>
                              ) : (
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center text-slate-500 font-bold">
                                  {totalStops > 0 ? 'All stops completed. Returning to warehouse.' : 'No deliveries assigned.'}
                                </div>
                              )}

                              <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-4">
                                <span>COMPLETED STOPS: {completedStops}</span>
                                <span>REMAINING STOPS: {pendingStops}</span>
                              </div>

                              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                {sortedDriverDeliveries.map((item, idx) => {
                                  const isCompleted = item.status === 'Completed';
                                  const isCurrent = nextStop?._id === item._id;

                                  return (
                                    <div 
                                      key={item._id} 
                                      className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                                        isCurrent 
                                          ? 'border-[#D4AF37] bg-[#D4AF37]/5' 
                                          : 'border-slate-100 bg-white'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <span className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] ${
                                          isCompleted 
                                            ? 'bg-slate-200 text-slate-500' 
                                            : isCurrent
                                              ? 'bg-[#D4AF37] text-white animate-pulse'
                                              : 'bg-slate-100 text-slate-400'
                                        }`}>
                                          {idx + 1}
                                        </span>
                                        <span className="font-bold text-slate-800 truncate" title={item.customerName}>{item.customerName}</span>
                                      </div>

                                      <div>
                                        {isCompleted ? (
                                          <span className="text-[8px] font-extrabold uppercase text-green-600 bg-green-50 border border-green-100 px-1 rounded">Completed</span>
                                        ) : isCurrent ? (
                                          <span className="text-[8px] font-extrabold uppercase text-[#003A8C] bg-[#003A8C]/10 border border-[#003A8C]/20 px-1 rounded animate-pulse">On Route</span>
                                        ) : (
                                          <span className="text-[8px] font-extrabold uppercase text-slate-400 bg-slate-50 border border-slate-100 px-1 rounded">Pending</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    // FLEET OVERVIEW PANEL
                    <div className="space-y-4">
                      <span className="font-extrabold text-slate-500 text-[10px] uppercase tracking-wider block mb-2">Fleet Drivers Status</span>
                      
                      {drivers.map((d) => {
                        const driverDeliveries = deliveries.filter(del => del.assignedDriver === d.name);
                        const totalStops = driverDeliveries.length;
                        const completedStops = driverDeliveries.filter(del => del.status === 'Completed').length;
                        const progressRatio = totalStops > 0 ? completedStops / totalStops : 0;

                        return (
                          <div 
                            key={d.name}
                            onClick={() => setSelectedDriverName(d.name)}
                            className="bg-white p-4.5 rounded-2xl border border-slate-200/60 shadow-sm hover:border-[#D4AF37]/50 hover:shadow-md cursor-pointer transition-all relative overflow-hidden group"
                          >
                            <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: d.color }} />
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-xs font-black text-slate-800 group-hover:text-[#003A8C] transition-colors">{d.name}</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{d.vehicle} &bull; {d.phone}</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase ${getStatusBadgeStyle(d.status)}`}>
                                {d.status}
                              </span>
                            </div>

                            {totalStops > 0 ? (
                              <div className="mt-3.5 space-y-2">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                  <span>Progress ({completedStops}/{totalStops} stops)</span>
                                  <span>{Math.round(progressRatio * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all duration-500" 
                                    style={{ 
                                      backgroundColor: d.color, 
                                      width: `${progressRatio * 100}%` 
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 font-bold mt-3 uppercase italic">No active dispatches</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Driver Portal controls (Driver role sees navigation stats) */}
                {user?.role === 'Driver' && (
                  <div className="space-y-5 text-slate-800">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <span className="font-bold text-slate-700 text-xs uppercase tracking-wider block border-b border-slate-100 pb-2">Driver Navigation Console</span>
                      
                      {currentTargetStop ? (
                        <div className="space-y-2.5 text-xs">
                          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-[#003A8C] font-extrabold block text-[10px] uppercase">Current Target Destination</span>
                            <span className="text-sm font-extrabold text-slate-800 block mt-1">{currentTargetStop.customerName}</span>
                            <span className="text-slate-500 font-semibold block mt-0.5">{currentTargetStop.deliveryAddress}</span>
                            <span className="text-slate-500 font-semibold block mt-0.5">Phone: {currentTargetStop.phoneNumber}</span>
                          </div>

                          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold">
                            <span className="text-slate-500">Live ETA:</span>
                            <span className="text-[#003A8C] animate-pulse">
                              {haversineDistance(driverPos.lat, driverPos.lng, currentTargetStop.latitude, currentTargetStop.longitude).toFixed(1)} km (~{Math.round(haversineDistance(driverPos.lat, driverPos.lng, currentTargetStop.latitude, currentTargetStop.longitude) * 1.5 + 1)}m)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center font-bold text-green-600 bg-green-50 py-4 rounded-xl">
                          All stops completed successfully!
                        </div>
                      )}
                    </div>

                    {isSimulating ? (
                      <button
                        onClick={() => {
                          setIsSimulating(false);
                          setIsWaitingConfirmation(false);
                        }}
                        className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
                      >
                        PAUSE SIMULATION ROUTE
                      </button>
                    ) : (
                      <button
                        onClick={handleStartRoute}
                        className="w-full py-4 bg-[#003A8C] text-[#D4AF37] font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-[#D4AF37]/35"
                      >
                        RESUME SIMULATION ROUTE
                      </button>
                    )}

                    {/* Stops List Sequence in Driver Sidebar */}
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider block mb-2">Stops List Sequence</span>
                      <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 text-xs">
                        <span className="w-5 h-5 rounded-full bg-[#003A8C] text-white font-bold flex items-center justify-center text-[10px]">W</span>
                        <span className="font-bold text-slate-700">Start: Warehouse</span>
                      </div>
                      
                      {activeRoute.map((item, idx) => {
                        const isCompleted = item.status === 'Completed';
                        const isTarget = currentTargetStop?._id === item._id;

                        return (
                          <div 
                            key={item._id} 
                            className={`flex items-center gap-2 p-2 bg-white rounded-lg border text-xs ${
                              isTarget 
                                ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-sm' 
                                : 'border-slate-200'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] ${
                              isCompleted 
                                ? 'bg-slate-300 text-slate-500' 
                                : isTarget 
                                  ? 'bg-[#D4AF37] text-white animate-pulse'
                                  : 'bg-slate-100 text-slate-500'
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="font-bold text-slate-800 truncate">{item.customerName}</span>
                              <span className="text-[9px] text-slate-400 truncate">{item.deliveryAddress}</span>
                            </div>
                            {isCompleted && (
                              <span className="text-green-600 font-extrabold uppercase text-[8px] tracking-wider font-sans">Completed</span>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 text-xs">
                        <span className="w-5 h-5 rounded-full bg-[#003A8C] text-white font-bold flex items-center justify-center text-[10px]">W</span>
                        <span className="font-bold text-slate-700">End: Return to Warehouse</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Footer */}
              <div className="p-6 border-t border-slate-200/80 bg-white text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0">
                Landmark Logistics Engine
              </div>

            </div>

          </div>
        </div>
      </div>
    );
  };

  // Main Dashboard return statement
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      
      {/* Premium Branded Header Navbar */}
      <header className="bg-[#003A8C] text-white border-b-4 border-[#D4AF37] shadow-md sticky top-0 z-30 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#D4AF37] text-[#003A8C] p-1.5 rounded-lg shadow-sm">
              <Navigation className="h-5 w-5 rotate-45 fill-current" />
            </div>
            <span className="text-lg font-bold tracking-tight uppercase">Landmark Smart Route Planner</span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="text-sm font-semibold">{user?.fullName}</span>
              <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider">
                {user?.role === 'Driver' ? 'Driver' : (user?.role === 'Admin' ? 'Admin' : 'Dispatcher')} Portal
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-bold border border-white/10 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer animate-fade-in"
            >
              <LogOut className="h-4 w-4" />
              <span>LOG OUT</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conditional Dashboards based on user role */}
      {(user?.role === 'Dispatcher' || user?.role === 'Admin') ? renderDispatcherDashboard() : renderDriverDashboard()}

      {/* Fullscreen Map Modal */}
      {renderMapModal()}

    </div>
  );
};
