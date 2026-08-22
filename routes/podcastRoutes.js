const express = require('express');
const router = express.Router();
const podcastController = require('../controllers/podcastController');

router.get('/', podcastController.getPodcasts);
router.post('/:id/like', podcastController.likePodcast);

module.exports = router;
