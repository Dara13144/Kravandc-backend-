const express = require('express');
const router = express.Router();
const movieController = require('../controllers/movieController');
const { authenticateToken, optionalToken } = require('../middlewares/auth');

router.get('/', movieController.getMovies);
router.get('/home', movieController.getHomeContent);
router.get('/slug/:slug', optionalToken, movieController.getMovieBySlug);
router.get('/:slug', optionalToken, movieController.getMovieBySlug);
router.post('/favorite', authenticateToken, movieController.toggleFavorite);
router.get('/favorites', authenticateToken, movieController.getUserFavorites);
router.post('/progress', authenticateToken, movieController.saveWatchProgress);
router.post('/review', authenticateToken, movieController.addReview);
router.get('/:id/reviews', movieController.getMovieReviews);
router.get('/:id/comments', movieController.getMovieReviews);
router.patch('/video-logo', optionalToken, movieController.updateVideoLogo);
router.post('/video-logo', optionalToken, movieController.updateVideoLogo);
router.patch('/:id/video-logo', optionalToken, movieController.updateVideoLogo);
router.post('/:id/video-logo', optionalToken, movieController.updateVideoLogo);

module.exports = router;
