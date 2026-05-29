import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid company email address').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['Dispatcher', 'Driver']),
});

type LoginFields = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingState, setIsSubmittingState] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      role: 'Dispatcher',
    },
  });

  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setValue('email', savedEmail);
      setRememberMe(true);
    }
  }, [setValue]);

  const onSubmit = async (data: LoginFields) => {
    setIsSubmittingState(true);
    setErrorMsg(null);
    try {
      const userData = await login(data.email, data.password, data.role, rememberMe);
      
      // Perform role verification
      let isRoleValid = false;
      if (data.role === 'Driver') {
        isRoleValid = (userData.role === 'Driver');
      } else if (data.role === 'Dispatcher') {
        isRoleValid = (userData.role === 'Admin' || userData.role === 'Dispatcher');
      }

      if (!isRoleValid) {
        await logout();
        throw new Error('Role Mismatch');
      }

      toast.success('Logged in successfully!');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error(err);
      const message = err.response?.data?.error || err.message || 'Invalid email or password. Please try again.';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsSubmittingState(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col justify-between relative font-sans">
      
      {/* Top Corner Logo */}
      <div className="absolute top-8 left-8 z-20">
        <img src="/logo.png" alt="Landmark Group Logo" className="h-16 w-auto object-contain" />
      </div>

      {/* Main Container - Centered card */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 z-10">
        <div className="w-full max-w-[470px] bg-white rounded-[24px] shadow-[0_25px_60px_-15px_rgba(0,31,91,0.12),0_20px_35px_-10px_rgba(0,31,91,0.06)] border border-slate-100/80 p-11 relative overflow-hidden border-t-4 border-[#D4AF37]">
          
          {/* Header Text */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#003A8C] tracking-tight mb-3 leading-[1.25] px-1">
              Welcome to Landmark <span className="text-[#D4AF37]">Smart Route Planner</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm font-medium">
              Enter your corporate credentials to access the secure logistics mapping platform.
            </p>
          </div>

          {/* Error Message Box */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-3 animate-shake">
              <span className="font-bold text-sm">!</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            
            {/* Role Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Select Your Role <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all duration-200 ${
                  watch('role') === 'Dispatcher'
                    ? 'border-[#003A8C] bg-[#003A8C]/5 text-[#003A8C] ring-2 ring-[#003A8C]/10'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Dispatcher</span>
                    <span className="text-[10px] text-slate-500 font-normal">Monitor operations</span>
                  </div>
                  <input
                    type="radio"
                    value="Dispatcher"
                    {...register('role')}
                    className="h-4 w-4 text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37] cursor-pointer"
                  />
                </label>

                <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all duration-200 ${
                  watch('role') === 'Driver'
                    ? 'border-[#003A8C] bg-[#003A8C]/5 text-[#003A8C] ring-2 ring-[#003A8C]/10'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Driver</span>
                    <span className="text-[10px] text-slate-500 font-normal">Execute routes</span>
                  </div>
                  <input
                    type="radio"
                    value="Driver"
                    {...register('role')}
                    className="h-4 w-4 text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37] cursor-pointer"
                  />
                </label>
              </div>
              {errors.role && (
                <p className="text-xs font-medium text-red-500 mt-1">{errors.role.message}</p>
              )}
            </div>

            {/* Company Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Company Email <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 h-4 w-4 text-[#003A8C]" />
                <input
                  type="email"
                  placeholder="name@landmark.com"
                  {...register('email')}
                  className={`w-full pl-11 pr-4 py-3 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                    errors.email
                      ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                      : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 h-4 w-4 text-[#003A8C]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your account password"
                  {...register('password')}
                  className={`w-full pl-11 pr-11 py-3 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                    errors.password
                      ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                      : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-slate-400 hover:text-[#003A8C] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs font-medium text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Action Row: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs font-semibold">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-[#D4AF37] border-slate-300 rounded focus:ring-[#D4AF37] accent-[#D4AF37] cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2.5 text-slate-600 cursor-pointer hover:text-slate-800 transition-colors">
                  Remember me
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="text-[#D4AF37] hover:text-[#C9A227] transition-all relative py-0.5 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-[#D4AF37] after:transition-all after:duration-300"
              >
                Forgot Password?
              </Link>
            </div>

            {/* Submit Button: Redesigned with premium gradient, bold gold text and hover glow/lift */}
            <button
              type="submit"
              disabled={isSubmittingState}
              className="w-full bg-gradient-to-r from-[#001F5B] to-[#003A8C] text-[#D4AF37] font-bold py-3.5 px-4 rounded-xl shadow-md shadow-[#001F5B]/10 tracking-[0.07em] uppercase transition-all duration-300 flex items-center justify-center gap-2 hover:from-[#00113B] hover:to-[#002B70] hover:text-[#FFE58F] hover:shadow-[0_0_25px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-85 disabled:cursor-wait cursor-pointer"
            >
              {isSubmittingState ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>LOGIN</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

          </form>

          {/* Registration Helper Footer */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500 font-semibold">
            Don't have a portal account?{' '}
            <Link
              to="/register"
              className="text-[#D4AF37] font-bold hover:text-[#C9A227] transition-all ml-1 relative py-0.5 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-[#D4AF37] after:transition-all after:duration-300"
            >
              Register here
            </Link>
          </div>

        </div>

        {/* Development Bypass Assist */}
        <div className="mt-6 w-full max-w-[470px] p-4 bg-white/70 border border-slate-200/50 rounded-2xl text-[11px] text-slate-600 leading-relaxed shadow-sm">
          <span className="font-bold text-landmark-blue block mb-1 uppercase tracking-wider text-[10px]">
            Dubai HQ Portal Test Accounts:
          </span>
          <div className="space-y-0.5 font-medium">
            <span className="block">• Select "Driver" (for Route execution): <code className="bg-slate-100 px-1 py-0.5 border rounded">driver@landmark.com</code> / <code className="bg-slate-100 px-1 py-0.5 border rounded">DriverPass123!</code></span>
            <span className="block">• Select "Dispatcher" (for Route monitoring): <code className="bg-slate-100 px-1 py-0.5 border rounded">dispatcher@landmark.com</code> / <code className="bg-slate-100 px-1 py-0.5 border rounded">DispatchPass123!</code></span>
          </div>
        </div>
      </div>

      {/* Page Footer */}
      <footer className="w-full text-center pb-8 text-xs text-slate-400 font-semibold z-10">
        &copy; Landmark Group. All Rights Reserved.
      </footer>

    </div>
  );
};
