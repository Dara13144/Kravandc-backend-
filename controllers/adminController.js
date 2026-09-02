const prisma = require('../utils/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Admin Dashboard Stats Overview & Analytics
 */
const getAdminStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalMovies,
      totalOrders,
      totalPayments,
      totalRevenueAggregate,
      recentOrders,
      recentPayments,
      recentUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.movie.count(),
      prisma.order.count(),
      prisma.payment.count({ where: { status: 'PAID' } }),
      prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { price: true }
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: true, movie: true }
      }),
      prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      }),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, createdAt: true }
      })
    ]);

    const totalRevenue = totalRevenueAggregate._sum.price || 0;

    // Monthly revenue mock dataset for charts
    const chartData = [
      { month: 'Jan', revenue: 1200 },
      { month: 'Feb', revenue: 1900 },
      { month: 'Mar', revenue: 2400 },
      { month: 'Apr', revenue: 1800 },
      { month: 'May', revenue: 3100 },
      { month: 'Jun', revenue: 4200 },
      { month: 'Jul', revenue: 3800 },
      { month: 'Aug', revenue: Math.max(5000, totalRevenue) }
    ];

    return sendSuccess(res, 'Admin analytics retrieved', {
      stats: {
        totalUsers,
        totalMovies,
        totalOrders,
        totalPayments,
        totalRevenue
      },
      chartData,
      recentOrders,
      recentPayments,
      recentUsers
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Create / Update / Delete Movie (Admin)
 */
const createMovie = async (req, res, next) => {
  try {
    const {
      title,
      description,
      poster,
      banner,
      trailerUrl,
      videoUrl,
      videoLogo,
      isPremium,
      price,
      rentalPrice,
      rating,
      duration,
      releaseYear,
      director,
      cast,
      country,
      language,
      isFeatured,
      isTrending,
      genres, // Array of genre IDs
      categories // Array of category IDs
    } = req.body;

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const movie = await prisma.movie.create({
      data: {
        title,
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        description,
        poster: poster || '/assets/posters/default.jpg',
        banner: banner || '/assets/banners/default.jpg',
        trailerUrl: trailerUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoUrl: videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        videoLogo: videoLogo || '/logo.png',
        isPremium: Boolean(isPremium),
        price: parseFloat(price || 0),
        rentalPrice: parseFloat(rentalPrice || 0),
        rating: parseFloat(rating || 8.0),
        duration: parseInt(duration || 120),
        releaseYear: parseInt(releaseYear || 2026),
        director: director || 'KV Cinema Director',
        cast: cast || 'Starring KV Cinema Actors',
        country: country || 'USA',
        language: language || 'English',
        isFeatured: Boolean(isFeatured),
        isTrending: Boolean(isTrending),
        status: 'PUBLISHED'
      }
    });

    // Link Genres if provided
    if (genres && Array.isArray(genres)) {
      for (const genreId of genres) {
        await prisma.movieGenre.create({
          data: { movieId: movie.id, genreId }
        });
      }
    }

    // Link Categories if provided
    if (categories && Array.isArray(categories)) {
      for (const categoryId of categories) {
        await prisma.movieCategory.create({
          data: { movieId: movie.id, categoryId }
        });
      }
    }

    return sendSuccess(res, 'Movie created successfully', movie, 201);
  } catch (err) {
    next(err);
  }
};

const updateMovie = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      poster,
      banner,
      trailerUrl,
      videoUrl,
      videoLogo,
      isPremium,
      price,
      rentalPrice,
      rating,
      director,
      cast
    } = req.body;

    const updated = await prisma.movie.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(poster && { poster }),
        ...(banner && { banner }),
        ...(trailerUrl !== undefined && { trailerUrl }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(videoLogo !== undefined && { videoLogo }),
        ...(isPremium !== undefined && { isPremium: Boolean(isPremium) }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(rentalPrice !== undefined && { rentalPrice: parseFloat(rentalPrice) }),
        ...(rating !== undefined && { rating: parseFloat(rating) }),
        ...(director && { director }),
        ...(cast && { cast })
      }
    });

    return sendSuccess(res, 'Movie and video link updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

const deleteMovie = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.movie.delete({ where: { id } });
    return sendSuccess(res, 'Movie deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Manage Users & Wallet Adjustments (Admin)
 */
const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        wallet: {
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 15
            }
          }
        },
        _count: {
          select: {
            orders: true,
            payments: true,
            reviews: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return sendSuccess(res, 'Users list retrieved', users);
  } catch (err) {
    next(err);
  }
};

const adjustUserBalance = async (req, res, next) => {
  try {
    const { userId, amount, action = 'ADD', reason = '', note = '' } = req.body;
    const adminEmail = req.user?.email || 'Admin';

    if (!userId) {
      return sendError(res, 'User ID is required');
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return sendError(res, 'Please provide a valid positive numeric amount');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true }
    });

    if (!user) {
      return sendError(res, 'User not found');
    }

    let wallet = user.wallet;
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0.0, currency: 'USD' }
      });
    }

    const balanceBefore = Number(wallet.balance) || 0;
    let balanceAfter = balanceBefore;
    let txType = 'ADMIN_ADJUSTMENT';
    let txDesc = '';

    if (action === 'ADD' || action === 'CREDIT') {
      balanceAfter = parseFloat((balanceBefore + numAmount).toFixed(2));
      txType = 'DEPOSIT';
      txDesc = reason || note ? `Admin Top-Up (+$${numAmount.toFixed(2)}): ${reason || note}` : `Admin manual balance top-up: +$${numAmount.toFixed(2)} USD (by ${adminEmail})`;
    } else if (action === 'DEDUCT' || action === 'DEBIT') {
      balanceAfter = parseFloat(Math.max(0, balanceBefore - numAmount).toFixed(2));
      txType = 'WITHDRAW';
      txDesc = reason || note ? `Admin Deduction (-$${numAmount.toFixed(2)}): ${reason || note}` : `Admin manual balance deduction: -$${numAmount.toFixed(2)} USD (by ${adminEmail})`;
    } else if (action === 'SET') {
      balanceAfter = parseFloat(numAmount.toFixed(2));
      txType = 'ADMIN_ADJUSTMENT';
      txDesc = reason || note ? `Admin Set Balance to $${numAmount.toFixed(2)}: ${reason || note}` : `Admin reset balance to $${numAmount.toFixed(2)} USD (by ${adminEmail})`;
    }

    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter }
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: numAmount,
          balanceBefore,
          balanceAfter,
          type: txType,
          status: 'COMPLETED',
          reference: `ADM_${Date.now()}`,
          description: txDesc
        }
      })
    ]);

    // Real-time socket broadcast to the target user room and global admin listeners
    if (global.io) {
      global.io.to(`user_${userId}`).emit('wallet_updated', {
        message: `Admin ${action === 'ADD' ? 'credited +$' + numAmount.toFixed(2) : action === 'DEDUCT' ? 'deducted -$' + numAmount.toFixed(2) : 'adjusted your balance to $' + numAmount.toFixed(2)} USD`,
        balance: balanceAfter,
        newBalance: balanceAfter
      });
      global.io.emit('admin_wallet_updated', {
        userId,
        balance: balanceAfter
      });
    }

    return sendSuccess(res, `User balance successfully updated to $${balanceAfter.toFixed(2)} USD`, {
      wallet: updatedWallet,
      transaction,
      balanceBefore,
      balanceAfter
    });
  } catch (err) {
    next(err);
  }
};

const getUserTransactions = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return sendSuccess(res, 'User transactions retrieved', transactions);
  } catch (err) {
    next(err);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return sendError(res, 'Invalid user role');
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true }
    });
    return sendSuccess(res, `User role updated to ${role}`, updated);
  } catch (err) {
    next(err);
  }
};

/**
 * Manage Transactions (Approve/Reject Payment)
 */
const getPayments = async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    return sendSuccess(res, 'Payments retrieved', payments);
  } catch (err) {
    next(err);
  }
};

const abaPaywayService = require('../services/abaPaywayService');

const updatePaymentStatus = async (req, res, next) => {
  try {
    const { paymentId, status } = req.body;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: { include: { wallet: true } } }
    });

    if (!payment) return sendError(res, 'Payment record not found');

    if (status === 'PAID' && payment.status !== 'PAID') {
      await abaPaywayService.handleCallback({
        tran_id: payment.transactionId,
        status: 0,
        pw_tran_id: payment.pwTranId || `ADMIN_APPROVED_${Date.now()}`
      });
    } else {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status }
      });
    }

    return sendSuccess(res, `Payment status updated to ${status}`);
  } catch (err) {
    next(err);
  }
};

const createPodcast = async (req, res, next) => {
  try {
    const { title, description, audioUrl, videoUrl, coverImage, duration, category, price, isPremium } = req.body;
    const podcast = await prisma.podcast.create({
      data: {
        title,
        description,
        audioUrl: audioUrl || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        videoUrl: videoUrl || null,
        coverImage: coverImage || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600',
        duration: parseInt(duration || 1800),
        category: category || 'Interviews',
        price: parseFloat(price || 0),
        isPremium: Boolean(isPremium)
      }
    });
    return sendSuccess(res, 'Podcast created successfully', podcast, 201);
  } catch (err) {
    next(err);
  }
};

const updatePodcast = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, audioUrl, videoUrl, coverImage, duration, category, price, isPremium } = req.body;
    const updated = await prisma.podcast.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(audioUrl && { audioUrl }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(coverImage && { coverImage }),
        ...(duration !== undefined && { duration: parseInt(duration) }),
        ...(category && { category }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isPremium !== undefined && { isPremium: Boolean(isPremium) })
      }
    });
    return sendSuccess(res, 'Podcast updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

const getSettings = async (req, res, next) => {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    return sendSuccess(res, 'Settings retrieved successfully', settingsMap);
  } catch (err) {
    next(err);
  }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value, description } = req.body;
    if (!key || value === undefined) {
      return sendError(res, 'Setting key and value are required', null, 400);
    }
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: String(value), description },
      create: { key, value: String(value), description }
    });
    return sendSuccess(res, `Setting "${key}" updated successfully`, setting);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAdminStats,
  createMovie,
  updateMovie,
  deleteMovie,
  createPodcast,
  updatePodcast,
  deletePodcast,
  getUsers,
  adjustUserBalance,
  getUserTransactions,
  updateUserRole,
  getPayments,
  updatePaymentStatus,
  getSettings,
  updateSetting
};
