const prisma = require('../utils/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get All Movies with Filters, Search, Pagination, & Sorting
 */
const getMovies = async (req, res, next) => {
  try {
    const {
      search,
      genre,
      category,
      releaseYear,
      rating,
      priceType, // 'free' | 'premium'
      sort = 'newest',
      page = 1,
      limit = 12
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where = {
      status: 'PUBLISHED'
    };

    // Live search
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { director: { contains: search } },
        { cast: { contains: search } }
      ];
    }

    // Genre filter
    if (genre) {
      where.genres = {
        some: {
          genre: {
            slug: genre.toLowerCase()
          }
        }
      };
    }

    // Category filter
    if (category) {
      where.categories = {
        some: {
          category: {
            slug: category.toLowerCase()
          }
        }
      };
    }

    // Year filter
    if (releaseYear) {
      where.releaseYear = parseInt(releaseYear);
    }

    // Rating filter
    if (rating) {
      where.rating = { gte: parseFloat(rating) };
    }

    // Price type filter
    if (priceType === 'free') {
      where.isPremium = false;
    } else if (priceType === 'premium') {
      where.isPremium = true;
    }

    // Sorting logic
    let orderBy = {};
    switch (sort) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'price_low':
        orderBy = { price: 'asc' };
        break;
      case 'price_high':
        orderBy = { price: 'desc' };
        break;
      case 'popular':
        orderBy = { viewCount: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where,
        include: {
          genres: { include: { genre: true } },
          categories: { include: { category: true } }
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.movie.count({ where })
    ]);

    // Format output with genres list
    const formattedMovies = movies.map(movie => ({
      ...movie,
      genres: movie.genres.map(g => g.genre.name),
      categories: movie.categories.map(c => c.category.name)
    }));

    return sendSuccess(res, 'Movies retrieved', {
      movies: formattedMovies,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Featured, Trending, & Top Rated Movies for Homepage
 */
const getHomeContent = async (req, res, next) => {
  try {
    const [featuredRaw, trendingRaw, popularRaw, topRatedRaw, latestRaw, categories, banners] = await Promise.all([
      prisma.movie.findMany({
        where: { isFeatured: true, status: 'PUBLISHED' },
        include: { genres: { include: { genre: true } } },
        take: 5
      }),
      prisma.movie.findMany({
        where: { isTrending: true, status: 'PUBLISHED' },
        include: { genres: { include: { genre: true } } },
        take: 10
      }),
      prisma.movie.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { viewCount: 'desc' },
        include: { genres: { include: { genre: true } } },
        take: 10
      }),
      prisma.movie.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { rating: 'desc' },
        include: { genres: { include: { genre: true } } },
        take: 10
      }),
      prisma.movie.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        include: { genres: { include: { genre: true } } },
        take: 10
      }),
      prisma.category.findMany({
        include: { _count: { select: { movies: true } } }
      }),
      prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { position: 'asc' }
      })
    ]);

    const formatMovie = (m) => ({
      ...m,
      genres: m.genres ? m.genres.map(g => g.genre?.name || g.name || g) : []
    });

    const latest = latestRaw.map(formatMovie);
    const featured = (featuredRaw.length > 0 ? featuredRaw.map(formatMovie) : latest).slice(0, 5);
    const trending = (trendingRaw.length > 0 ? trendingRaw.map(formatMovie) : latest).slice(0, 10);
    const popular = (popularRaw.length > 0 ? popularRaw.map(formatMovie) : latest).slice(0, 10);
    const topRated = (topRatedRaw.length > 0 ? topRatedRaw.map(formatMovie) : latest).slice(0, 10);

    return sendSuccess(res, 'Home content retrieved', {
      featured,
      trending,
      popular,
      topRated,
      latest,
      categories,
      banners
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get Movie Details by Slug / ID
 */
const getMovieBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const movie = await prisma.movie.findFirst({
      where: {
        OR: [{ slug }, { id: slug }]
      },
      include: {
        genres: { include: { genre: true } },
        categories: { include: { category: true } },
        episodes: { orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }] },
        reviews: {
          where: { status: 'APPROVED' },
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!movie) return sendError(res, 'Movie not found', null, 404);

    // Increment view count
    await prisma.movie.update({
      where: { id: movie.id },
      data: { viewCount: { increment: 1 } }
    });

    // Check user access and VIP status
    let hasAccess = !movie.isPremium;
    let hasVipPass = false;
    let isFavorite = false;

    if (req.user) {
      // Check for VIP All Access Pass
      const vipOrder = await prisma.order.findFirst({
        where: {
          userId: req.user.id,
          type: 'ALL_ACCESS_VIP',
          status: 'COMPLETED',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      });

      if (vipOrder || ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        hasVipPass = true;
        hasAccess = true;
      }

      if (movie.isPremium && !hasAccess) {
        // Check for single movie purchase or rental
        const movieOrder = await prisma.order.findFirst({
          where: {
            userId: req.user.id,
            movieId: movie.id,
            status: 'COMPLETED',
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          }
        });

        if (movieOrder) {
          hasAccess = true;
        }
      }

      const favorite = await prisma.favorite.findUnique({
        where: {
          userId_movieId: {
            userId: req.user.id,
            movieId: movie.id
          }
        }
      });
      if (favorite) isFavorite = true;
    }

    // Related movies in same category
    const categoryIds = movie.categories.map(c => c.categoryId);
    const relatedMovies = await prisma.movie.findMany({
      where: {
        id: { not: movie.id },
        categories: { some: { categoryId: { in: categoryIds } } }
      },
      take: 6,
      include: { genres: { include: { genre: true } } }
    });

    return sendSuccess(res, 'Movie details retrieved', {
      movie: {
        ...movie,
        genres: movie.genres.map(g => g.genre.name),
        categories: movie.categories.map(c => c.category.name),
        hasAccess,
        hasVipPass,
        isFavorite
      },
      related: relatedMovies.map(m => ({
        ...m,
        genres: m.genres.map(g => g.genre.name)
      }))
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Toggle Favorite Movie
 */
const toggleFavorite = async (req, res, next) => {
  try {
    const { movieId } = req.body;
    const userId = req.user.id;

    const existing = await prisma.favorite.findUnique({
      where: { userId_movieId: { userId, movieId } }
    });

    if (existing) {
      await prisma.favorite.delete({
        where: { id: existing.id }
      });
      return sendSuccess(res, 'Removed from favorites', { isFavorite: false });
    } else {
      await prisma.favorite.create({
        data: { userId, movieId }
      });
      return sendSuccess(res, 'Added to favorites', { isFavorite: true });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Get User Favorites List
 */
const getUserFavorites = async (req, res, next) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: {
        movie: {
          include: { genres: { include: { genre: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const movies = favorites.map(f => ({
      ...f.movie,
      genres: f.movie.genres.map(g => g.genre.name)
    }));

    return sendSuccess(res, 'Favorites retrieved', movies);
  } catch (err) {
    next(err);
  }
};

/**
 * Save / Update Watch Progress
 */
const saveWatchProgress = async (req, res, next) => {
  try {
    const { movieId, episodeId, progressSeconds, durationSeconds } = req.body;
    const userId = req.user.id;

    const history = await prisma.watchHistory.upsert({
      where: {
        userId_movieId_episodeId: {
          userId,
          movieId,
          episodeId: episodeId || null
        }
      },
      update: {
        progressSeconds,
        durationSeconds
      },
      create: {
        userId,
        movieId,
        episodeId: episodeId || null,
        progressSeconds,
        durationSeconds
      }
    });

    return sendSuccess(res, 'Watch progress saved', history);
  } catch (err) {
    next(err);
  }
};

/**
 * Add Review for Movie
 */
const addReview = async (req, res, next) => {
  try {
    const { movieId, rating, comment } = req.body;
    const userId = req.user.id;

    if (!movieId || !rating || !comment) {
      return sendError(res, 'Movie ID, rating, and comment are required');
    }

    const review = await prisma.review.create({
      data: {
        userId,
        movieId,
        rating: parseInt(rating),
        comment,
        status: 'APPROVED'
      },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    // Recalculate movie average rating
    const reviews = await prisma.review.findMany({
      where: { movieId, status: 'APPROVED' }
    });
    const avgRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;

    await prisma.movie.update({
      where: { id: movieId },
      data: { rating: parseFloat(avgRating.toFixed(1)) }
    });

    // Emit real-time comment to movie room
    if (global.io) {
      global.io.to(`movie_${movieId}`).emit('new_comment', review);
    }

    return sendSuccess(res, 'Review submitted successfully', review, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Get All Reviews & Comments for Movie
 */
const getMovieReviews = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reviews = await prisma.review.findMany({
      where: {
        OR: [{ movieId: id }, { movie: { slug: id } }],
        status: 'APPROVED'
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'Reviews retrieved', reviews);
  } catch (err) {
    next(err);
  }
};

/**
 * Update Video Logo / Watermark directly (Single Movie or Global All Movies)
 */
const updateVideoLogo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { videoLogo, updateAll = false } = req.body;

    if (!videoLogo) {
      return sendError(res, 'Video logo image/URL is required');
    }

    if (!id || id === 'undefined' || id === 'null' || id === 'all' || updateAll) {
      await prisma.movie.updateMany({
        data: { videoLogo }
      });
      if (global.io) {
        global.io.emit('video_logo_updated', { videoLogo });
      }
      return sendSuccess(res, 'Video logo updated across all movies', { videoLogo });
    }

    const movie = await prisma.movie.findFirst({
      where: { OR: [{ id }, { slug: id }] }
    });

    if (!movie) {
      await prisma.movie.updateMany({
        data: { videoLogo }
      });
      if (global.io) {
        global.io.emit('video_logo_updated', { videoLogo });
      }
      return sendSuccess(res, 'Video logo updated across all movies', { videoLogo });
    }

    const updated = await prisma.movie.update({
      where: { id: movie.id },
      data: { videoLogo }
    });

    if (global.io) {
      global.io.to(`movie_${movie.id}`).emit('video_logo_updated', { movieId: movie.id, videoLogo });
      global.io.emit('video_logo_updated', { movieId: movie.id, videoLogo });
    }

    return sendSuccess(res, 'Video logo updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMovies,
  getHomeContent,
  getMovieBySlug,
  toggleFavorite,
  getUserFavorites,
  saveWatchProgress,
  addReview,
  getMovieReviews,
  updateVideoLogo
};
