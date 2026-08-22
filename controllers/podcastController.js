const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendSuccess, sendError } = require('../utils/response');

const getPodcasts = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const where = {};

    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const podcasts = await prisma.podcast.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'Podcasts retrieved', podcasts);
  } catch (err) {
    next(err);
  }
};

const likePodcast = async (req, res, next) => {
  try {
    const { id } = req.params;
    const podcast = await prisma.podcast.update({
      where: { id },
      data: { likesCount: { increment: 1 } }
    });
    return sendSuccess(res, 'Podcast liked', podcast);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPodcasts,
  likePodcast
};
