const prisma = require('../utils/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Task 8: POST /api/orders
 * Create a new pending Order from Cart Items (Calculates total amount strictly from Database!)
 */
const createOrder = async (req, res, next) => {
  try {
    const { items, movieId, type = 'ECOMMERCE', payWithWallet = false } = req.body;
    const userId = req.user.id;

    let totalCents = 0;
    const orderItemsData = [];

    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          return sendError(res, `Product not found: ${item.productId}`, null, 404);
        }

        const qty = Math.max(1, parseInt(item.quantity || 1));
        const itemCents = Math.round(product.price * 100) * qty;
        totalCents += itemCents;

        orderItemsData.push({
          productId: product.id,
          quantity: qty,
          price: product.price
        });
      }
    } else if (req.body.amount && parseFloat(req.body.amount) > 0) {
      totalCents = Math.round(parseFloat(req.body.amount) * 100);
    } else {
      return sendError(res, 'No items or valid amount specified for checkout.');
    }

    const calculatedTotal = totalCents / 100;

    // Check if paying directly with wallet
    if (payWithWallet) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < calculatedTotal) {
        return sendError(res, `Insufficient wallet balance. Required: $${calculatedTotal.toFixed(2)}, Balance: $${(wallet?.balance || 0).toFixed(2)}`, null, 402);
      }

      const [order] = await prisma.$transaction([
        prisma.order.create({
          data: {
            userId,
            movieId: movieId || null,
            totalAmount: calculatedTotal,
            price: calculatedTotal,
            currency: 'USD',
            type,
            status: 'COMPLETED',
            orderItems: { create: orderItemsData }
          },
          include: { orderItems: { include: { product: true } } }
        }),
        prisma.wallet.update({
          where: { userId },
          data: { balance: { decrement: calculatedTotal } }
        }),
        prisma.transaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: calculatedTotal,
            type: 'ECOMMERCE',
            status: 'COMPLETED',
            description: `Order Checkout ($${calculatedTotal.toFixed(2)} USD)`
          }
        })
      ]);

      return sendSuccess(res, 'Order placed successfully with wallet balance', order, 201);
    }

    // Otherwise create PENDING order for KHQR / PayWay payment gateway
    const order = await prisma.order.create({
      data: {
        userId,
        movieId: movieId || null,
        totalAmount: calculatedTotal,
        price: calculatedTotal,
        currency: 'USD',
        type,
        status: 'PENDING',
        orderItems: {
          create: orderItemsData
        }
      },
      include: {
        orderItems: { include: { product: true } }
      }
    });

    return sendSuccess(res, 'Order created successfully. Ready for payment.', {
      orderId: order.id,
      totalAmount: calculatedTotal,
      currency: 'USD',
      order
    }, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Get Order Details by ID
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: { include: { product: true } },
        payments: true,
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!order) {
      return sendError(res, 'Order not found', null, 404);
    }

    return sendSuccess(res, 'Order retrieved successfully', order);
  } catch (err) {
    next(err);
  }
};

/**
 * Purchase or Rent Movie using Wallet Balance
 */
const purchaseMovie = async (req, res, next) => {
  try {
    const { movieId, purchaseType = 'LIFETIME', couponCode } = req.body;
    const userId = req.user.id;

    if (!movieId) {
      return sendError(res, 'Movie ID required');
    }

    const movie = await prisma.movie.findUnique({ where: { id: movieId } });
    if (!movie) return sendError(res, 'Movie not found', null, 404);

    if (!movie.isPremium) {
      return sendError(res, 'This movie is free! No purchase required.');
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        userId,
        movieId,
        status: 'COMPLETED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (existingOrder) {
      return sendError(res, 'You already have access to watch this movie!');
    }

    let finalPrice = purchaseType === 'RENTAL' ? movie.rentalPrice : movie.price;

    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (coupon && coupon.usedCount < coupon.usageLimit && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
        if (coupon.type === 'PERCENTAGE') {
          const discount = (finalPrice * coupon.value) / 100;
          finalPrice -= coupon.maxDiscount ? Math.min(discount, coupon.maxDiscount) : discount;
        } else if (coupon.type === 'FIXED') {
          finalPrice -= coupon.value;
        }
        finalPrice = Math.max(0, finalPrice);
        await prisma.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } }
        });
      }
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < finalPrice) {
      return sendError(res, 'Insufficient wallet balance. Please top up to purchase.', {
        required: finalPrice,
        currentBalance: wallet ? wallet.balance : 0
      }, 402);
    }

    const expiresAt = purchaseType === 'RENTAL' ? new Date(Date.now() + 48 * 60 * 60 * 1000) : null;

    const [order, updatedWallet] = await prisma.$transaction([
      prisma.order.create({
        data: {
          userId,
          movieId,
          totalAmount: finalPrice,
          price: finalPrice,
          type: purchaseType,
          expiresAt,
          status: 'COMPLETED'
        },
        include: { movie: true }
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: finalPrice } }
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: finalPrice,
          type: purchaseType === 'RENTAL' ? 'MOVIE_RENTAL' : 'MOVIE_PURCHASE',
          status: 'COMPLETED',
          description: `${purchaseType === 'RENTAL' ? 'Rented' : 'Purchased'} movie: ${movie.title}`
        }
      })
    ]);

    return sendSuccess(res, `Movie successfully ${purchaseType === 'RENTAL' ? 'rented' : 'purchased'}!`, {
      order,
      newBalance: updatedWallet.balance
    }, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Get User Orders & Purchases History
 */
const getUserOrders = async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        orderItems: { include: { product: true } },
        movie: true,
        payments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'User orders retrieved', orders);
  } catch (err) {
    next(err);
  }
};

const purchaseAllAccessPass = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const passPrice = parseFloat(req.body.price || 19.99);

    const existingVip = await prisma.order.findFirst({
      where: {
        userId,
        type: 'ALL_ACCESS_VIP',
        status: 'COMPLETED'
      }
    });

    if (existingVip) {
      return sendError(res, 'You already own the VIP All-Access Pass! All movies and videos are already unlocked.');
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < passPrice) {
      return sendError(res, `Insufficient wallet balance for VIP All-Access Pass ($${passPrice.toFixed(2)}). Please top up or pay with KHQR.`, {
        required: passPrice,
        currentBalance: wallet ? wallet.balance : 0
      }, 402);
    }

    const [order, updatedWallet] = await prisma.$transaction([
      prisma.order.create({
        data: {
          userId,
          totalAmount: passPrice,
          price: passPrice,
          type: 'ALL_ACCESS_VIP',
          status: 'COMPLETED'
        }
      }),
      prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: passPrice } }
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: passPrice,
          type: 'ALL_ACCESS_VIP_PASS',
          status: 'COMPLETED',
          description: 'KV Cinema VIP All-Access Pass: Unlocked All Current & Future Movies/Videos'
        }
      })
    ]);

    return sendSuccess(res, '🌟 VIP All-Access Pass activated! All movies and videos on the website are now permanently unlocked!', {
      order,
      newBalance: updatedWallet.balance
    }, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Initialize Pending Order for Direct ABA KHQR / ABA PayWay VIP Pass Checkout
 */
const createVipPaymentOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const passPrice = parseFloat(req.body.price || 19.99);

    const order = await prisma.order.create({
      data: {
        userId,
        totalAmount: passPrice,
        price: passPrice,
        type: 'ALL_ACCESS_VIP',
        status: 'PENDING'
      }
    });

    return sendSuccess(res, 'VIP All-Access Pass order initialized', {
      orderId: order.id,
      price: passPrice,
      type: 'ALL_ACCESS_VIP'
    }, 201);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  getOrderById,
  purchaseMovie,
  purchaseAllAccessPass,
  createVipPaymentOrder,
  getUserOrders
};
