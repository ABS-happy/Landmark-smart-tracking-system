import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2, User, Phone, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid company email address').trim().toLowerCase(),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
  role: z.enum(['Dispatcher', 'Driver']),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFields = z.infer<typeof registerSchema>;

export const Register: React.FC = () => {
  const { registerUser } = useAuth();
  const navigate = useNavigate();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingState, setIsSubmittingState] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFields>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      role: 'Dispatcher',
    },
  });

  const passwordValue = watch('password', '');

  // Real-time password requirement states
  const reqs = {
    length: passwordValue.length >= 8,
    upper: /[A-Z]/.test(passwordValue),
    lower: /[a-z]/.test(passwordValue),
    number: /[0-9]/.test(passwordValue),
    special: /[^A-Za-z0-9]/.test(passwordValue),
  };

  const onSubmit = async (data: RegisterFields) => {
    setIsSubmittingState(true);
    setErrorMsg(null);
    try {
      await registerUser({
        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: data.password,
        role: data.role === 'Driver' ? 'Driver' : 'Dispatcher',
      });
      toast.success('Registration successful! Please login.');
      navigate('/login');
    } catch (err: any) {
      console.error(err);
      const message = err.response?.data?.error || 'Registration failed. Please try again.';
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

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 z-10">
        <div className="w-full max-w-xl bg-white rounded-[24px] shadow-[0_25px_60px_-15px_rgba(0,31,91,0.12),0_20px_35px_-10px_rgba(0,31,91,0.06)] border border-slate-100/80 p-11 relative overflow-hidden border-t-4 border-[#D4AF37]">
          
          {/* Header Text */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-extrabold text-[#003A8C] tracking-tight">Register Portal Account</h2>
            <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">Join the secure Landmark logistics dispatcher panel</p>
          </div>

          {/* Error Message Box */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl flex items-center gap-3 animate-shake">
              <span className="font-semibold text-base">!</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    {...register('fullName')}
                    className={`w-full pl-11 pr-4 py-2.5 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                      errors.fullName
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                        : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                    }`}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-xs font-medium text-red-500 mt-1">{errors.fullName.message}</p>
                )}
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                    <Phone className="h-4.5 w-4.5" />
                  </div>
                  <input
                    type="tel"
                    placeholder="+971 50 123 4567"
                    {...register('phoneNumber')}
                    className={`w-full pl-11 pr-4 py-2.5 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                      errors.phoneNumber
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                        : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                    }`}
                  />
                </div>
                {errors.phoneNumber && (
                  <p className="text-xs font-medium text-red-500 mt-1">{errors.phoneNumber.message}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Company Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <input
                  type="email"
                  placeholder="name@landmark.com"
                  {...register('email')}
                  className={`w-full pl-11 pr-4 py-2.5 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Role Selection */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Select User Role <span className="text-red-500">*</span>
                </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all duration-200 ${
                  watch('role') === 'Dispatcher'
                    ? 'border-[#003A8C] bg-[#003A8C]/5 text-[#003A8C] ring-2 ring-[#003A8C]/10'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Dispatcher</span>
                    <span className="text-[10px] text-slate-500 font-normal">Assign & monitor routes</span>
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
                    <span className="text-[10px] text-slate-500 font-normal">Receive routes & complete deliveries</span>
                  </div>
                  <input
                    type="radio"
                    value="Driver"
                    {...register('role')}
                    className="h-4 w-4 text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37] cursor-pointer"
                  />
                </label>
              </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    {...register('password')}
                    className={`w-full pl-11 pr-11 py-2.5 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                      errors.password
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                        : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-[#003A8C] transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs font-medium text-red-500 mt-1">{errors.password.message}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    {...register('confirmPassword')}
                    className={`w-full pl-11 pr-11 py-2.5 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
                      errors.confirmPassword
                        ? 'border-red-300 focus:ring-red-100 focus:border-red-500'
                        : 'border-slate-200 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-[#003A8C] transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs font-medium text-red-500 mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            {/* Real-time Checklist for Password strength */}
            {passwordValue && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <p className="font-semibold text-slate-700">Password requirements:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className={`flex items-center gap-1.5 font-medium ${reqs.length ? 'text-green-600' : 'text-slate-400'}`}>
                    {reqs.length ? <CheckCircle2 className="h-4 w-4 fill-green-50" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    At least 8 characters
                  </div>
                  <div className={`flex items-center gap-1.5 font-medium ${reqs.upper ? 'text-green-600' : 'text-slate-400'}`}>
                    {reqs.upper ? <CheckCircle2 className="h-4 w-4 fill-green-50" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    1 uppercase letter
                  </div>
                  <div className={`flex items-center gap-1.5 font-medium ${reqs.lower ? 'text-green-600' : 'text-slate-400'}`}>
                    {reqs.lower ? <CheckCircle2 className="h-4 w-4 fill-green-50" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    1 lowercase letter
                  </div>
                  <div className={`flex items-center gap-1.5 font-medium ${reqs.number ? 'text-green-600' : 'text-slate-400'}`}>
                    {reqs.number ? <CheckCircle2 className="h-4 w-4 fill-green-50" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    1 number (0-9)
                  </div>
                  <div className={`flex items-center gap-1.5 font-medium ${reqs.special ? 'text-green-600' : 'text-slate-400'}`}>
                    {reqs.special ? <CheckCircle2 className="h-4 w-4 fill-green-50" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    1 special char (e.g. @, #)
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmittingState}
              className="w-full bg-gradient-to-r from-[#001F5B] to-[#003A8C] text-[#D4AF37] font-bold py-3.5 px-4 rounded-xl shadow-md shadow-[#001F5B]/10 tracking-[0.07em] uppercase transition-all duration-300 flex items-center justify-center gap-2 hover:from-[#00113B] hover:to-[#002B70] hover:text-[#FFE58F] hover:shadow-[0_0_25px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-85 disabled:cursor-wait cursor-pointer"
            >
              {isSubmittingState ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-[#D4AF37]" />
                  <span>Creating Account...</span>
                </>
              ) : (
                'Register & Setup Account'
              )}
            </button>

          </form>

          {/* Login Link */}
          <div className="mt-6 pt-4 border-t border-slate-100/80 text-center text-xs text-slate-500 font-semibold">
            Already have an active account?{' '}
            <Link
              to="/login"
              className="text-[#D4AF37] font-bold hover:text-[#C9A227] ml-1 relative py-0.5 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-[#D4AF37] after:transition-all after:duration-300"
            >
              Log in here
            </Link>
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
