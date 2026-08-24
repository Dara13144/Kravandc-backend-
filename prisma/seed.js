const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting KV Digital Cinema Database Seeding...');

  // 1. Create Admin & Test Users
  const hashedPassword = await bcrypt.hash('Admin@123456', 10);
  const userPassword = await bcrypt.hash('User@123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@kvcinema.com' },
    update: { password: hashedPassword, role: 'SUPER_ADMIN' },
    create: {
      name: 'Super Admin',
      email: 'admin@kvcinema.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      emailVerified: true,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      wallet: {
        create: { balance: 999.00, currency: 'USD' }
      }
    }
  });

  const user = await prisma.user.upsert({
    where: { email: 'demo@kvcinema.com' },
    update: { password: userPassword, role: 'USER' },
    create: {
      name: 'John Doe',
      email: 'demo@kvcinema.com',
      password: userPassword,
      role: 'USER',
      emailVerified: true,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      wallet: {
        create: { balance: 150.00, currency: 'USD' }
      }
    }
  });

  console.log(' ✅ Created Users:', { admin: admin.email, user: user.email });

  // 1.5 Create Seed E-Commerce Products
  const sampleProducts = [
    {
      name: 'KV Digital Cinema Summer VIP Pass',
      description: 'Unlimited 4K IMAX streaming pass for 3 months with 50% discount on merchandise.',
      price: 25.99,
      stock: 100,
      image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600',
      category: 'Memberships',
      status: 'ACTIVE'
    },
    {
      name: 'Pro Wireless Spatial Audio Cinema Headphones',
      description: 'Dolby Atmos spatial surround sound wireless cinema headphones with active noise cancellation.',
      price: 89.00,
      stock: 45,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
      category: 'Electronics',
      status: 'ACTIVE'
    },
    {
      name: 'IMAX 3D Laser Cinema Voucher',
      description: 'Single ticket voucher valid for any IMAX 3D movie premiere at KV Digital Cinema.',
      price: 12.50,
      stock: 200,
      image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600',
      category: 'Tickets',
      status: 'ACTIVE'
    },
    {
      name: 'Gourmet Popcorn & Beverage Combo Pass',
      description: 'Large truffle caramel popcorn + 2 jumbo fountain drinks digital redeem code.',
      price: 7.99,
      stock: 300,
      image: 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=600',
      category: 'Snacks',
      status: 'ACTIVE'
    }
  ];

  for (const p of sampleProducts) {
    const existingP = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existingP) {
      await prisma.product.create({ data: p });
    }
  }
  console.log(' ✅ Created Sample E-Commerce Products');

  // 2. Create Categories & Genres
  const categoryNames = ['Movies', 'TV Shows', 'Anime', 'Podcast', 'Documentary'];
  const createdCategories = {};
  for (const name of categoryNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const cat = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, description: `Watch best ${name} on KV Digital Cinema` }
    });
    createdCategories[name] = cat.id;
  }

  const genreNames = ['Action', 'Sci-Fi', 'Drama', 'Comedy', 'Horror', 'Romance', 'Anime', 'Marvel', 'DC'];
  const createdGenres = {};
  for (const name of genreNames) {
    const slug = name.toLowerCase();
    const g = await prisma.genre.upsert({
      where: { slug },
      update: {},
      create: { name, slug }
    });
    createdGenres[name] = g.id;
  }

  // 3. Create Seed Movies
  const sampleMovies = [
    {
      title: 'Oppenheimer: The Atomic Legacy',
      slug: 'oppenheimer-the-atomic-legacy',
      description: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.',
      poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500',
      banner: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1200',
      trailerUrl: 'https://www.youtube.com/watch?v=uYPbbksJxIg',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      isPremium: true,
      price: 9.99,
      rentalPrice: 3.99,
      rating: 8.9,
      duration: 180,
      releaseYear: 2023,
      director: 'Christopher Nolan',
      cast: 'Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.',
      isFeatured: true,
      isTrending: true,
      genres: ['Drama', 'Action'],
      category: 'Movies'
    },
    {
      title: 'Avatar: The Way of Water',
      slug: 'avatar-the-way-of-water',
      description: 'Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. Once a familiar threat returns, Jake must work with Neytiri.',
      poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500',
      banner: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200',
      trailerUrl: 'https://www.youtube.com/watch?v=d9MyW72ELq0',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      isPremium: true,
      price: 12.99,
      rentalPrice: 4.99,
      rating: 7.8,
      duration: 192,
      releaseYear: 2022,
      director: 'James Cameron',
      cast: 'Sam Worthington, Zoe Saldana, Sigourney Weaver',
      isFeatured: true,
      isTrending: true,
      genres: ['Sci-Fi', 'Action'],
      category: 'Movies'
    },
    {
      title: 'Spider-Man: Across the Spider-Verse',
      slug: 'spider-man-across-the-spider-verse',
      description: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.',
      poster: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?w=500',
      banner: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200',
      trailerUrl: 'https://www.youtube.com/watch?v=cqGjhVJWtEg',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      isPremium: false,
      price: 0.00,
      rentalPrice: 0.00,
      rating: 8.7,
      duration: 140,
      releaseYear: 2023,
      director: 'Joaquim Dos Santos',
      cast: 'Shameik Moore, Hailee Steinfeld, Oscar Isaac',
      isFeatured: true,
      isTrending: true,
      genres: ['Marvel', 'Anime', 'Action'],
      category: 'Movies'
    },
    {
      title: 'The Dark Knight: Legacy',
      slug: 'the-dark-knight-legacy',
      description: 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological tests.',
      poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500',
      banner: 'https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=1200',
      trailerUrl: 'https://www.youtube.com/watch?v=EXeTwQWrcwY',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      isPremium: false,
      price: 0.00,
      rentalPrice: 0.00,
      rating: 9.0,
      duration: 152,
      releaseYear: 2021,
      director: 'Christopher Nolan',
      cast: 'Christian Bale, Heath Ledger, Aaron Eckhart',
      isFeatured: false,
      isTrending: true,
      genres: ['DC', 'Action', 'Drama'],
      category: 'Movies'
    },
    {
      title: 'Cyberpunk Edgerunners: Neon City',
      slug: 'cyberpunk-edgerunners-neon-city',
      description: 'A street kid trying to survive in a technology and body modification-obsessed city of the future decides to stay alive by becoming a mercenary outlaw.',
      poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500',
      banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200',
      trailerUrl: 'https://www.youtube.com/watch?v=JtqIas3bYhg',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      isPremium: true,
      price: 6.99,
      rentalPrice: 2.99,
      rating: 8.6,
      duration: 25,
      releaseYear: 2024,
      director: 'Hiroyuki Imaishi',
      cast: 'KENN, Aoi Yuuki, Hiroki Touchi',
      isFeatured: false,
      isTrending: true,
      genres: ['Anime', 'Sci-Fi', 'Action'],
      category: 'TV Shows'
    }
  ];

  for (const mData of sampleMovies) {
    const genreNames = mData.genres;
    const catName = mData.category;
    delete mData.genres;
    delete mData.category;

    const movie = await prisma.movie.upsert({
      where: { slug: mData.slug },
      update: {},
      create: mData
    });

    // Add Genre relations
    for (const gName of genreNames) {
      if (createdGenres[gName]) {
        await prisma.movieGenre.upsert({
          where: {
            movieId_genreId: { movieId: movie.id, genreId: createdGenres[gName] }
          },
          update: {},
          create: { movieId: movie.id, genreId: createdGenres[gName] }
        });
      }
    }

    // Add Category relation
    if (createdCategories[catName]) {
      await prisma.movieCategory.upsert({
        where: {
          movieId_categoryId: { movieId: movie.id, categoryId: createdCategories[catName] }
        },
        update: {},
        create: { movieId: movie.id, categoryId: createdCategories[catName] }
      });
    }

    // Add sample episodes for TV Shows
    if (catName === 'TV Shows') {
      await prisma.episode.createMany({
        data: [
          {
            movieId: movie.id,
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Episode 1: Code of the Street',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            duration: 24,
            thumbnail: mData.poster
          },
          {
            movieId: movie.id,
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Episode 2: Neon Dreams',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            duration: 25,
            thumbnail: mData.poster
          }
        ]
      });
    }
  }

  // 4. Create Podcasts
  await prisma.podcast.createMany({
    data: [
      {
        title: 'CinemaTalk #42 - The Future of Modern Filmmaking',
        description: 'Deep dive into CGI, AI directors, IMAX cameras, and spatial audio in 2026 cinema.',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        coverImage: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=500',
        duration: 45,
        category: 'Cinema Talk',
        likesCount: 142
      },
      {
        title: 'Behind The Scenes: Oppenheimer Sound Design',
        description: 'Exclusive interview with Oscar-winning sound engineers on building atomic roar acoustics.',
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        coverImage: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=500',
        duration: 32,
        category: 'Interviews',
        likesCount: 98
      }
    ]
  });

  // 5. Create Banners
  await prisma.banner.createMany({
    data: [
      {
        title: 'Exclusive Summer Cinema Pass 50% Off!',
        imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200',
        linkUrl: '/movies',
        position: 1,
        isActive: true
      }
    ]
  });

  console.log(' 🎉 Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
