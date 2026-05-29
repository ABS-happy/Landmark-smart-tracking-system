import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle, Info } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid company email address').trim().toLowerCase(),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export const ForgotPassword: React.FC = () => {
  const [isSubmittingState, setIsSubmittingState] = useState(false);
  const [success, setSuccess] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFields) => {
    setIsSubmittingState(true);
    setDevResetLink(null);
    try {
      const response = await api.post('/auth/forgot-password', { email: data.email });
      setSuccess(true);
      toast.success('Reset email simulated successfully!');
      if (response.data.devResetLink) {
        setDevResetLink(response.data.devResetLink);
      }
    } catch (err: any) {
      console.error(err);
      const message = err.response?.data?.error || 'Failed to request reset link. Please try again.';
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

          {!success ? (
            <>
              {/* Header Text */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold text-[#003A8C] tracking-tight">Forgot Password?</h2>
                <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                  Enter your company email and we will send you a password reset link
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
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

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmittingState}
                  className="w-full bg-gradient-to-r from-[#001F5B] to-[#003A8C] text-[#D4AF37] font-bold py-3.5 px-4 rounded-xl shadow-md shadow-[#001F5B]/10 tracking-[0.07em] uppercase transition-all duration-300 flex items-center justify-center gap-2 hover:from-[#00113B] hover:to-[#002B70] hover:text-[#FFE58F] hover:shadow-[0_0_25px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-85 disabled:cursor-wait cursor-pointer"
                >
                  {isSubmittingState ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin text-[#D4AF37]" />
                      <span>Requesting Link...</span>
                    </>
                  ) : (
                    'Send Reset Link'
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
                  Back to Login
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Check Your Inbox</h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                If the email matches an account in our system, we have sent a secure password reset link to your email address.
              </p>

              {/* Dev Test Link Helper */}
              {devResetLink && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-100 rounded-xl text-left text-xs text-slate-700">
                  <div className="flex items-center gap-1.5 text-[#003A8C] font-bold mb-2">
                    <Info className="h-4 w-4 text-[#003A8C]" />
                    Development Bypass Link
                  </div>
                  <p className="mb-3 text-[11px] text-slate-500">
                    To test the flow without checking terminal server logs, click the link below to load the password reset screen:
                  </p>
                  <a
                    href={devResetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 bg-white border border-yellow-200 rounded font-mono text-[10px] text-[#003A8C] hover:text-[#002B70] hover:underline break-all"
                  >
                    {devResetLink}
                  </a>
                </div>
              )}

              <Link
                to="/login"
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
              >
                Return to Login Screen
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
