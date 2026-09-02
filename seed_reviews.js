const prisma = require('./utils/prisma');

async function seedReviews() {
  console.log('🌱 Populating real comments, ratings, and view counts...');

  const movies = await prisma.movie.findMany();
  const users = await prisma.user.findMany();

  if (movies.length === 0 || users.length === 0) {
    console.log('No movies or users found to seed reviews.');
    return;
  }

  const sampleReviews = [
    {
      rating: 10,
      comment: '🔥 Absolutely stunning 4K HDR quality! The spatial audio and colors on Kravan DC are unbeatable.'
    },
    {
      rating: 9,
      comment: 'Incredible cinematography and storyline. The stream loaded instantly with zero buffering on 4K.'
    },
    {
      rating: 10,
      comment: 'Best movie premiere experience in Cambodia. Top up with Bakong KHQR took literally 2 seconds!'
    },
    {
      rating: 9,
      comment: 'Masterpiece directing and sound design. Highly recommend watching with headphones.'
    },
    {
      rating: 8,
      comment: 'Great pacing and action sequences. Excited for more episodes on Kravan DC!'
    }
  ];

  for (const movie of movies) {
    // Update viewCount to realistic active number
    const views = Math.floor(Math.random() * 25000) + 5000;
    await prisma.movie.update({
      where: { id: movie.id },
      data: { viewCount: views }
    });

    // Check if reviews already exist
    const existing = await prisma.review.count({ where: { movieId: movie.id } });
    if (existing === 0) {
      for (let i = 0; i < sampleReviews.length; i++) {
        const u = users[i % users.length];
        const rev = sampleReviews[i];
        await prisma.review.create({
          data: {
            movieId: movie.id,
            userId: u.id,
            rating: rev.rating,
            comment: rev.comment,
            status: 'APPROVED'
          }
        });
      }
    }
  }

  console.log(`✅ Seeded real comments and views across ${movies.length} movies!`);
}

seedReviews()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
