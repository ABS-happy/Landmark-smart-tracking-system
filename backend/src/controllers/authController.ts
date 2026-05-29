import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';

const COOKIE_NAME = 'refreshToken';

// Validation Schemas
export const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  role: z.enum(['Dispatcher', 'Driver'], {
    required_error: 'Role is required',
  }),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

// Token Generation Helper Functions
const generateAccessToken = (userId: string, role: string): string => {
  const secret = process.env.ACCESS_TOKEN_SECRET || 'default_access_secret';
  return jwt.sign({ userId, role }, secret, { expiresIn: '15m' });
};

const generateRefreshToken = (userId: string): string => {
  const secret = process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret';
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
};

// Set refresh token in HttpOnly Cookie
const setRefreshTokenCookie = (res: Response, token: string) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction, // secure in production
    sameSite: isProduction ? 'none' : 'lax', // cross-site allowed in production (if domains differ), lax for dev
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const register = async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    
    // Check duplicate email
    const existingUser = await User.findOne({ email: validatedData.email });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    // Create user
    const newUser = new User({
      fullName: validatedData.fullName,
      email: validatedData.email,
      phoneNumber: validatedData.phoneNumber,
      passwordHash,
      role: validatedData.role,
      isVerified: false, // Default unverified for demo, can be marked verified later
    });

    await newUser.save();

    return res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Registration Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password, role } = req.body;
  console.log(`[Auth] Login Attempt: email=${email}, selectedRole=${role}`);

  try {
    // 1. Validate inputs via Zod
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const isEmailError = parsed.error.issues.some(issue => issue.path.includes('email'));
      const errorMsg = isEmailError ? 'Invalid Email' : 'Invalid Password';
      console.log(`[Auth] Authentication Failed: Zod validation error - ${errorMsg}`);
      return res.status(400).json({ error: errorMsg });
    }

    const { email: cleanEmail, password: cleanPassword } = parsed.data;

    // 2. Query user records in MongoDB
    let user;
    try {
      user = await User.findOne({ email: cleanEmail });
    } catch (dbErr: any) {
      console.error(`[Auth] Database Error: ${dbErr.message}`);
      console.log(`[Auth] Authentication Failed: Database Error`);
      return res.status(500).json({ error: 'Database Error' });
    }

    if (!user) {
      console.log(`[Auth] Authentication Failed: User Not Found (${cleanEmail})`);
      return res.status(401).json({ error: 'User Not Found' });
    }

    console.log(`[Auth] User Found: email=${user.email}, Role Found: role=${user.role}`);

    // 3. Verify password hashing using bcrypt
    const isMatch = await bcrypt.compare(cleanPassword, user.passwordHash);
    console.log(`[Auth] Password Validation Result: ${isMatch ? 'Success' : 'Failed'}`);
    
    if (!isMatch) {
      console.log(`[Auth] Authentication Failed: Invalid Password for ${cleanEmail}`);
      return res.status(401).json({ error: 'Invalid Password' });
    }

    // 4. Verify role mapping (restored UI options)
    if (role) {
      let isRoleValid = false;
      if (role === 'Driver') {
        isRoleValid = (user.role === 'Driver');
      } else if (role === 'Dispatcher') {
        isRoleValid = (user.role === 'Admin' || user.role === 'Dispatcher');
      }
      
      console.log(`[Auth] Role Match Verification: selected=${role}, db=${user.role}, Result=${isRoleValid ? 'Match' : 'Mismatch'}`);
      
      if (!isRoleValid) {
        console.log(`[Auth] Authentication Failed: Role Mismatch for ${cleanEmail}`);
        return res.status(401).json({ error: 'Role Mismatch' });
      }
    }

    // 5. Generate tokens
    let accessToken;
    let refreshToken;
    try {
      accessToken = generateAccessToken(user._id.toString(), user.role);
      refreshToken = generateRefreshToken(user._id.toString());
      console.log(`[Auth] JWT Generated for userId=${user._id}`);
    } catch (tokenErr: any) {
      console.error(`[Auth] Token Generation Error: ${tokenErr.message}`);
      console.log(`[Auth] Authentication Failed: Server Error`);
      return res.status(500).json({ error: 'Server Error' });
    }

    // Save refresh token to user model
    user.refreshToken = refreshToken;
    await user.save();

    // Set refresh token in cookie
    setRefreshTokenCookie(res, refreshToken);

    console.log(`[Auth] Authentication Success: ${user.email} logged in successfully.`);

    return res.status(200).json({
      message: 'Login successful',
      accessToken,
      user,
    });
  } catch (error: any) {
    console.error(`[Auth] General Login Server Error: ${error.message}`);
    console.log(`[Auth] Authentication Failed: Server Error`);
    return res.status(500).json({ error: 'Server Error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies[COOKIE_NAME];
    
    if (refreshToken) {
      // Find user and clear token in db
      const user = await User.findOne({ refreshToken });
      if (user) {
        user.refreshToken = undefined;
        await user.save();
      }
    }

    // Clear client-side cookie
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies[COOKIE_NAME];

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    // Find user in db
    const user = await User.findOne({ refreshToken });
    if (!user) {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    const secret = process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret';

    jwt.verify(refreshToken, secret, async (err: any, decoded: any) => {
      if (err) {
        // Token is invalid/expired
        user.refreshToken = undefined;
        await user.save();
        res.clearCookie(COOKIE_NAME);
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken(user._id.toString(), user.role);
      const newRefreshToken = generateRefreshToken(user._id.toString());

      // Rotate refresh token
      user.refreshToken = newRefreshToken;
      await user.save();

      setRefreshTokenCookie(res, newRefreshToken);

      return res.status(200).json({
        accessToken: newAccessToken,
        user,
      });
    });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);

    const user = await User.findOne({ email: validatedData.email });
    if (!user) {
      // Return 200 for security to prevent user enumeration, but log the error
      console.log(`[Forgot Password] Requested for non-existent email: ${validatedData.email}`);
      return res.status(200).json({
        message: 'If the email matches an account in our system, a password reset link has been generated.',
      });
    }

    // Generate random reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Hash token to store in DB
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour expiration
    await user.save();

    // Log the link to the console for testing
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;
    console.log('\n======================================================');
    console.log(`[EMAIL DISPATCH MOCK] Sending reset password link to: ${user.email}`);
    console.log(`Reset Link: ${resetLink}`);
    console.log('======================================================\n');

    return res.status(200).json({
      message: 'If the email matches an account in our system, a password reset link has been generated.',
      // For ease of development, in non-production, return the reset token directly in the response metadata so they can test instantly
      ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    
    // Hash the token from request to check against DB
    const hashedToken = crypto.createHash('sha256').update(validatedData.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Password reset token is invalid or has expired' });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(validatedData.password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    // Mark user verified once they successfully reset password
    user.isVerified = true;

    await user.save();

    return res.status(200).json({ message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Reset Password Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('Get Me Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
