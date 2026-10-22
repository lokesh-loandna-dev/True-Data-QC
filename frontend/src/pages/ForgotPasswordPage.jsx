import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { notify } from '../utils/toast';

const STEPS = {
  EMAIL: 1,
  OTP: 2,
  PASSWORD: 3,
  SUCCESS: 4,
};

const STEP_ITEMS = [
  { id: STEPS.EMAIL, label: 'Email' },
  { id: STEPS.OTP, label: 'Verify OTP' },
  { id: STEPS.PASSWORD, label: 'New Password' },
];

const ForgotPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, resetPasswordWithOtp } = useAuth();

  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpInputRef = useRef(null);

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Focus OTP input when transitioning to OTP step
  useEffect(() => {
    if (step === STEPS.OTP && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  // Step 1: Send OTP to Email
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = 'Email address is required';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      const msg = 'Please enter a valid email address';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await sendOtp(cleanEmail);
      notify.success(res?.message || 'Verification code sent to your email.');
      setResendCooldown(60);
      setStep(STEPS.OTP);
    } catch (err) {
      const msg = err.message || 'Failed to send verification code. Please check your email.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await sendOtp(email.trim());
      notify.success(res?.message || 'A new verification code has been sent to your email.');
      setResendCooldown(60);
      setOtp('');
    } catch (err) {
      const msg = err.message || 'Failed to resend verification code.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      const msg = 'Please enter the 6-digit verification code';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (cleanOtp.length < 6) {
      const msg = 'Verification code must be 6 digits';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await verifyOtp(email.trim(), cleanOtp);
      notify.success(res?.message || 'Verification successful!');
      if (res?.reset_token) {
        setResetToken(res.reset_token);
      }
      setStep(STEPS.PASSWORD);
    } catch (err) {
      const msg = err.message || 'Invalid verification code. Please try again.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (!password) {
      const msg = 'New password is required';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (password.length < 6) {
      const msg = 'Password must be at least 6 characters long';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (!confirmPassword) {
      const msg = 'Please confirm your new password';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }
    if (password !== confirmPassword) {
      const msg = 'Passwords do not match';
      setErrorMsg(msg);
      notify.warning(msg);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await resetPasswordWithOtp(email.trim(), resetToken, password, confirmPassword);
      const successMsg = res?.message || 'Password reset successfully!';
      notify.success(successMsg);
      setStep(STEPS.SUCCESS);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { state: { email: email.trim() } });
      }, 2000);
    } catch (err) {
      const msg = err.message || 'Failed to reset password. Please try again.';
      setErrorMsg(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Page titles and subtitles based on step
  const getHeaderInfo = () => {
    switch (step) {
      case STEPS.EMAIL:
        return {
          title: 'Forgot Password',
          subtitle: 'Enter your account email address to receive a verification code',
        };
      case STEPS.OTP:
        return {
          title: 'Verify Code',
          subtitle: 'Enter the 6-digit verification code sent to your email',
        };
      case STEPS.PASSWORD:
        return {
          title: 'Set New Password',
          subtitle: 'Create a new secure password for your account',
        };
      case STEPS.SUCCESS:
        return {
          title: 'Password Updated!',
          subtitle: 'Your password has been successfully reset',
        };
      default:
        return { title: 'Reset Password', subtitle: '' };
    }
  };

  const header = getHeaderInfo();

  return (
    <AuthLayout title={header.title} subtitle={header.subtitle}>
      <div className="w-full">
        {/* Professional Stepper Navigation */}
        {step !== STEPS.SUCCESS && (
          <nav aria-label="Password reset progress" className="mb-7">
            <div className="relative">
              {/* Connecting Line Track */}
              <div
                className="absolute top-4 left-[16.67%] right-[16.67%] h-0.5 bg-gray-200 -translate-y-1/2 z-0"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-[#24A1DD] transition-[width] duration-300 ease-in-out"
                  style={{
                    width: step === STEPS.EMAIL ? '0%' : step === STEPS.OTP ? '50%' : '100%',
                  }}
                />
              </div>

              {/* Steps Grid */}
              <ol className="relative z-10 grid grid-cols-3 w-full">
                {STEP_ITEMS.map((item) => {
                  const isCompleted = step > item.id;
                  const isCurrent = step === item.id;
                  const isClickable = isCompleted && !loading;

                  return (
                    <li key={item.id} className="flex flex-col items-center">
                      <button
                        type="button"
                        disabled={!isClickable}
                        onClick={() => {
                          if (isClickable) {
                            setErrorMsg('');
                            setStep(item.id);
                          }
                        }}
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`flex flex-col items-center group focus:outline-none ${
                          isClickable ? 'cursor-pointer' : 'cursor-default'
                        }`}
                        title={isClickable ? `Return to ${item.label}` : undefined}
                      >
                        {/* Step Circle Indicator */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-[background-color,border-color,box-shadow,transform] duration-200 ${
                            isCompleted
                              ? 'bg-[#24A1DD] text-white shadow-xs group-hover:bg-[#1e95ce] group-hover:scale-105'
                              : isCurrent
                              ? 'bg-white border-2 border-[#24A1DD] text-[#24A1DD] ring-4 ring-[#24A1DD]/15 font-bold shadow-xs'
                              : 'bg-white border border-gray-300 text-gray-400'
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span>{item.id}</span>
                          )}
                        </div>

                        {/* Step Label */}
                        <span
                          className={`mt-2 text-xs transition-colors duration-200 select-none ${
                            isCurrent
                              ? 'font-semibold text-gray-900'
                              : isCompleted
                              ? 'font-medium text-gray-700 group-hover:text-[#24A1DD]'
                              : 'font-normal text-gray-400'
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </nav>
        )}

        {/* Global Error Alert */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4 text-sm text-center font-medium animate-shake">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Enter Email */}
        {step === STEPS.EMAIL && (
          <form onSubmit={handleSendOtp} noValidate>
            <CustomInput
              label="Registered Email Address"
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            />

            <div className="mt-5">
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full font-medium"
              >
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </CustomButton>
            </div>

            <div className="mt-6 text-center text-sm text-gray-500 font-normal">
              Remember your password?{' '}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Log In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: Verify OTP */}
        {step === STEPS.OTP && (
          <form onSubmit={handleVerifyOtp} noValidate>
            {/* Target Email Info Badge */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 overflow-hidden">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <span className="font-medium text-gray-700 truncate">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setStep(STEPS.EMAIL);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2 underline flex-shrink-0"
              >
                Change
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
                <span className="text-red-500 mr-1">*</span> Enter 6-Digit OTP
              </label>
              <input
                ref={otpInputRef}
                type="text"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                  setErrorMsg('');
                }}
                className="block w-full h-12 text-center text-2xl tracking-[0.4em] tabular-nums font-semibold text-gray-800 rounded-lg border border-gray-300 focus:border-[#24A1DD] focus:ring-2 focus:ring-[#24A1DD]/20 focus:outline-none transition-[border-color,box-shadow] duration-150"
              />
              <p className="mt-1.5 text-xs text-gray-500 text-center">
                Check your inbox and spam folder. Code expires in 10 minutes.
              </p>
            </div>

            {/* Resend Cooldown */}
            <div className="flex items-center justify-between text-sm mb-5 text-gray-500">
              <span>Didn't receive the code?</span>
              {resendCooldown > 0 ? (
                <span className="text-gray-400 font-medium">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  Resend Code
                </button>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <CustomButton
                type="button"
                variant="secondary"
                onClick={() => {
                  setErrorMsg('');
                  setStep(STEPS.EMAIL);
                }}
                className="w-1/3"
                disabled={loading}
              >
                Back
              </CustomButton>
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading || otp.length < 6}
                className="w-2/3 font-medium"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </CustomButton>
            </div>
          </form>
        )}

        {/* STEP 3: Enter New Password & Confirm Password */}
        {step === STEPS.PASSWORD && (
          <form onSubmit={handleResetPassword} noValidate>
            <CustomInput
              label="New Password"
              type="password"
              placeholder="Enter at least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            />

            <CustomInput
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrorMsg('');
              }}
              required
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            />

            {/* Password Validation Checklist */}
            <div className="bg-gray-50 border border-gray-200/80 rounded-lg p-3 mb-5 text-xs text-gray-600 space-y-1.5">
              <div className="flex items-center gap-2">
                {password.length >= 6 ? (
                  <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1 flex-shrink-0" />
                )}
                <span className={password.length >= 6 ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                  At least 6 characters long
                </span>
              </div>
              <div className="flex items-center gap-2">
                {confirmPassword && password === confirmPassword ? (
                  <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1 flex-shrink-0" />
                )}
                <span className={confirmPassword && password === confirmPassword ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                  Passwords must match
                </span>
              </div>
            </div>

            <div className="mt-5">
              <CustomButton
                type="submit"
                variant="primary"
                disabled={loading || password.length < 6 || password !== confirmPassword}
                className="w-full font-medium"
              >
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </CustomButton>
            </div>
          </form>
        )}

        {/* STEP 4: Success Message & Redirect */}
        {step === STEPS.SUCCESS && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Password Reset Successfully!
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              You can now sign in with your new password. Redirecting to login page...
            </p>
            <CustomButton
              type="button"
              variant="primary"
              onClick={() => navigate('/login', { state: { email: email.trim() } })}
              className="w-full"
            >
              Go to Login Now
            </CustomButton>
          </div>
        )}
      </div>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
