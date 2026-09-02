const prisma = require('../utils/prisma');
const { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Register User
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 'Name, email, and password are required');
    }

    const cleanIdentifier = email.trim();
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanIdentifier },
          { email: cleanIdentifier.toLowerCase() },
          { name: cleanIdentifier }
        ]
      }
    });
    if (existingUser) {
      return sendError(res, 'Account already registered. Please login.');
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: cleanIdentifier,
        password: hashedPassword,
        wallet: {
          create: {
            balance: 0.00,
            currency: 'USD'
          }
        }
      },
      include: { wallet: true }
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return sendSuccess(res, 'User registered successfully!', {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        balance: user.wallet?.balance || 0
      },
      accessToken,
      refreshToken
    }, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Login User
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'Please provide email and password');
    }

    const cleanInput = (email || '').trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanInput },
          { email: cleanInput.toLowerCase() },
          { name: cleanInput }
        ]
      },
      include: { wallet: true }
    });

    if (!user) {
      return sendError(res, 'Invalid credentials');
    }

    let isMatch = false;
    if (user.password) {
      isMatch = await comparePassword(password, user.password);
    }
    
    // Support streamer_demo and common demo passwords if needed
    if (!isMatch && (cleanInput === 'streamer_demo' || cleanInput === 'streamer_demo@gmail.com') && ['streamer_demo', '123456', 'Streamer@123', 'demo', 'password'].includes(password)) {
      isMatch = true;
    }

    if (!isMatch) {
      return sendError(res, 'Invalid credentials');
    }

    const vipOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        type: 'ALL_ACCESS_VIP',
        status: 'COMPLETED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    const hasVipPass = Boolean(vipOrder || ['ADMIN', 'SUPER_ADMIN'].includes(user.role));

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return sendSuccess(res, 'Login successful', {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        balance: user.wallet?.balance || 0,
        hasVipPass
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Google OAuth Login / Register
 */
const googleLogin = async (req, res, next) => {
  try {
    let { googleId, email, name, avatar, credential } = req.body;

    // If a Google JWT credential was provided from Google One Tap / GIS
    if (credential && (!email || !googleId)) {
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.email) email = payload.email;
          if (payload.sub) googleId = payload.sub;
          if (payload.name) name = payload.name;
          if (payload.picture) avatar = payload.picture;
        }
      } catch (decodeErr) {
        console.warn('[Google Auth] Failed to parse credential payload:', decodeErr.message);
      }
    }

    if (!email) {
      return sendError(res, 'Google account email is required');
    }

    const cleanEmail = email.trim().toLowerCase();

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanEmail },
          { email: email.trim() }
        ]
      },
      include: { wallet: true }
    });

    if (!user) {
      // Create new user via Google Register
      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0] || 'Google User',
          email: cleanEmail,
          googleId: googleId || `google_${Date.now()}`,
          avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          emailVerified: true,
          wallet: {
            create: {
              balance: 0.00,
              currency: 'USD'
            }
          }
        },
        include: { wallet: true }
      });
    } else {
      // Update existing user with Google ID and avatar if needed
      const updateData = { emailVerified: true };
      if (!user.googleId && googleId) updateData.googleId = googleId;
      if (!user.avatar && avatar) updateData.avatar = avatar;

      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        include: { wallet: true }
      });

      // Ensure user has a wallet
      if (!user.wallet) {
        const newWallet = await prisma.wallet.create({
          data: {
            userId: user.id,
            balance: 0.00,
            currency: 'USD'
          }
        });
        user.wallet = newWallet;
      }
    }

    const vipOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        type: 'ALL_ACCESS_VIP',
        status: 'COMPLETED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    const hasVipPass = Boolean(vipOrder || ['ADMIN', 'SUPER_ADMIN'].includes(user.role));

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return sendSuccess(res, 'Google authentication successful', {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        balance: user.wallet?.balance || 0,
        hasVipPass,
        emailVerified: user.emailVerified
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Refresh Token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return sendError(res, 'Refresh token required', null, 401);

    const decoded = verifyRefreshToken(token);
    if (!decoded) return sendError(res, 'Invalid or expired refresh token', null, 401);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { wallet: true }
    });

    if (!user) return sendError(res, 'User not found', null, 404);

    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return sendSuccess(res, 'Token refreshed successfully', {
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { wallet: true }
    });

    if (!user) return sendError(res, 'User not found', null, 404);

    const vipOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        type: 'ALL_ACCESS_VIP',
        status: 'COMPLETED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });
    const hasVipPass = Boolean(vipOrder || ['ADMIN', 'SUPER_ADMIN'].includes(user.role));

    return sendSuccess(res, 'User profile retrieved', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      balance: user.wallet?.balance || 0,
      hasVipPass,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update Profile & Upload Avatar
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    let avatarUrl = req.file ? `/uploads/${req.file.filename}` : (avatar || undefined);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(name && { name }),
        ...(avatarUrl && { avatar: avatarUrl })
      },
      include: { wallet: true }
    });

    return sendSuccess(res, 'Profile updated successfully', {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      balance: user.wallet?.balance || 0
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Change Password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return sendError(res, 'Current password and new password required');
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.password) {
      return sendError(res, 'User password not set');
    }

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, 'Incorrect current password');
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    return sendSuccess(res, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Delete Account
 */
const deleteAccount = async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    return sendSuccess(res, 'Account deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Forgot Password Mock
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    return sendSuccess(res, `Password reset instructions sent to ${email}`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  forgotPassword
};
