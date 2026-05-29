import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingState, setIsSubmittingState] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password', '');

  const reqs = {
    length: passwordValue.length >= 8,
    upper: /[A-Z]/.test(passwordValue),
    lower: /[a-z]/.test(passwordValue),
    number: /[0-9]/.test(passwordValue),
    special: /[^A-Za-z0-9]/.test(passwordValue),
  };

  const onSubmit = async (data: ResetPasswordFields) => {
    if (!token) {
      toast.error('Reset token is missing from URL.');
      return;
    }
    setIsSubmittingState(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        password: data.password,
      });
      setSuccess(true);
      toast.success('Password updated successfully!');
    } catch (err: any) {
      console.error(err);
      const message = err.response?.data?.error || 'Token expired or invalid. Please request a new link.';
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

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 z-10">
        <div className="w-full max-w-md bg-white rounded-[24px] shadow-[0_25px_60px_-15px_rgba(0,31,91,0.12),0_20px_35px_-10px_rgba(0,31,91,0.06)] border border-slate-100/80 p-11 relative overflow-hidden border-t-4 border-[#D4AF37]">

          {!token ? (
            <div className="text-center py-4">
              <XCircle className="h-14 w-14 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Invalid Reset URL</h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                The password reset token is missing. Please click the exact link from your email notification or generate a new reset request.
              </p>
              <Link
                to="/forgot-password"
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
              >
                Request New Link
              </Link>
            </div>
          ) : !success ? (
            <>
              {/* Header Text */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold text-[#003A8C] tracking-tight">Reset Your Password</h2>
                <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                  Enter your new secure password below to regain portal access
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                      <Lock className="h-4.5 w-4.5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create new password"
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
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#003A8C]">
                      <Lock className="h-4.5 w-4.5" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      {...register('confirmPassword')}
                      className={`w-full pl-11 pr-11 py-3 bg-slate-50/70 border rounded-xl text-sm transition-all duration-200 placeholder-slate-400/85 focus:outline-none focus:bg-white focus:ring-4 ${
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

                {/* Password Strength Checklist */}
                {passwordValue && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <p className="font-semibold text-slate-700">Password requirements:</p>
                    <div className="grid grid-cols-1 gap-1">
                      <div className={`flex items-center gap-1.5 font-medium ${reqs.length ? 'text-green-600' : 'text-slate-400'}`}>
                        {reqs.length ? <CheckCircle2 className="h-3.5 w-3.5 fill-green-50" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        At least 8 characters
                      </div>
                      <div className={`flex items-center gap-1.5 font-medium ${reqs.upper ? 'text-green-600' : 'text-slate-400'}`}>
                        {reqs.upper ? <CheckCircle2 className="h-3.5 w-3.5 fill-green-50" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        At least 1 uppercase letter
                      </div>
                      <div className={`flex items-center gap-1.5 font-medium ${reqs.lower ? 'text-green-600' : 'text-slate-400'}`}>
                        {reqs.lower ? <CheckCircle2 className="h-3.5 w-3.5 fill-green-50" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        At least 1 lowercase letter
                      </div>
                      <div className={`flex items-center gap-1.5 font-medium ${reqs.number ? 'text-green-600' : 'text-slate-400'}`}>
                        {reqs.number ? <CheckCircle2 className="h-3.5 w-3.5 fill-green-50" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        At least 1 numeric character (0-9)
                      </div>
                      <div className={`flex items-center gap-1.5 font-medium ${reqs.special ? 'text-green-600' : 'text-slate-400'}`}>
                        {reqs.special ? <CheckCircle2 className="h-3.5 w-3.5 fill-green-50" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        At least 1 special character (e.g. !)
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
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>

              </form>

              {/* Back to Login Link */}
              <div className="mt-6 pt-4 border-t border-slate-100/80 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#C9A227] transition-all relative py-0.5 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-[#D4AF37] after:transition-all after:duration-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Cancel and Return
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Password Updated</h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                Your portal password has been changed successfully. You can now use your new password to sign in.
              </p>
              <Link
                to="/login"
                className="w-full bg-gradient-to-r from-[#001F5B] to-[#003A8C] text-[#D4AF37] font-bold py-3.5 px-4 rounded-xl shadow-md shadow-[#001F5B]/10 tracking-[0.07em] uppercase transition-all duration-300 flex items-center justify-center gap-2 hover:from-[#00113B] hover:to-[#002B70] hover:text-[#FFE58F] hover:shadow-[0_0_25px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer text-center"
              >
                Log In to Portal
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* Page Footer */}
      <footer className="w-full text-center pb-8 text-xs text-slate-400 font-semibold z-10">
        &copy; Landmark Group. All Rights Reserved.
      </footer>
    </div>
  );
};
