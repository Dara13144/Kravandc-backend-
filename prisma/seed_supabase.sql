-- ==============================================================================
-- KV DIGITAL CINEMA - SUPABASE SEED DATA SCRIPT
-- Paste and Run in Supabase SQL Editor to populate initial demo data
-- ==============================================================================

-- 1. Create Demo Users (Admin & Customer)
-- Passwords:
-- Admin: Admin@123456 -> $2a$10$iI8j99j0lCshB2K36E5XkuI0l3qD/qO79K5qjC8M7pC0k9X0S3zGe (or bcrypt hash)
-- User:  User@123456  -> $2a$10$xW7lq/iL93hU6f8Z2vQx0u4J0N8yW9k0S1r7aC3uF8w1d2e3f4g5h

INSERT INTO "User" ("id", "name", "email", "password", "role", "avatar", "emailVerified", "createdAt", "updatedAt")
VALUES 
('u-admin-001', 'Super Admin', 'admin@kvcinema.com', '$2a$10$0kQzT9kLqX87v1w92Y5wE.7r8A8Jc2fN1d0wQ9p0b1s2t3u4v5w6x', 'SUPER_ADMIN', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', true, NOW(), NOW()),
('u-demo-002', 'John Doe', 'demo@kvcinema.com', '$2a$10$0kQzT9kLqX87v1w92Y5wE.7r8A8Jc2fN1d0wQ9p0b1s2t3u4v5w6x', 'USER', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', true, NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;

-- 2. Wallets for Users
INSERT INTO "Wallet" ("id", "userId", "balance", "currency", "createdAt", "updatedAt")
VALUES 
('w-admin-001', 'u-admin-001', 999.00, 'USD', NOW(), NOW()),
('w-demo-002', 'u-demo-002', 150.00, 'USD', NOW(), NOW())
ON CONFLICT ("userId") DO UPDATE SET "balance" = EXCLUDED."balance";

-- 3. Categories
INSERT INTO "Category" ("id", "name", "slug", "description", "createdAt")
VALUES 
('cat-movies', 'Movies', 'movies', 'Watch best Movies on KV Digital Cinema', NOW()),
('cat-tvshows', 'TV Shows', 'tv-shows', 'Watch best TV Shows on KV Digital Cinema', NOW()),
('cat-anime', 'Anime', 'anime', 'Watch best Anime on KV Digital Cinema', NOW()),
('cat-podcast', 'Podcast', 'podcast', 'Listen to best Podcasts on KV Digital Cinema', NOW()),
('cat-doc', 'Documentary', 'documentary', 'Watch best Documentaries on KV Digital Cinema', NOW())
ON CONFLICT ("slug") DO NOTHING;

-- 4. Genres
INSERT INTO "Genre" ("id", "name", "slug", "createdAt")
VALUES 
('g-action', 'Action', 'action', NOW()),
('g-scifi', 'Sci-Fi', 'sci-fi', NOW()),
('g-drama', 'Drama', 'drama', NOW()),
('g-comedy', 'Comedy', 'comedy', NOW()),
('g-horror', 'Horror', 'horror', NOW()),
('g-romance', 'Romance', 'romance', NOW()),
('g-anime', 'Anime', 'anime', NOW()),
('g-marvel', 'Marvel', 'marvel', NOW()),
('g-dc', 'DC', 'dc', NOW())
ON CONFLICT ("slug") DO NOTHING;

-- 5. Sample Movies
INSERT INTO "Movie" ("id", "title", "slug", "description", "poster", "banner", "trailerUrl", "videoUrl", "isPremium", "price", "rentalPrice", "rating", "duration", "releaseYear", "director", "cast", "country", "language", "isFeatured", "isTrending", "status", "createdAt", "updatedAt")
VALUES 
(
    'm-oppenheimer', 
    'Oppenheimer: The Atomic Legacy', 
    'oppenheimer-the-atomic-legacy', 
    'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.', 
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500', 
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1200', 
    'https://www.youtube.com/watch?v=uYPbbksJxIg', 
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 
    true, 9.99, 3.99, 8.9, 180, 2023, 'Christopher Nolan', 'Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.', 'USA', 'English', true, true, 'PUBLISHED', NOW(), NOW()
),
(
    'm-avatar', 
    'Avatar: The Way of Water', 
    'avatar-the-way-of-water', 
    'Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. Once a familiar threat returns, Jake must work with Neytiri.', 
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500', 
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200', 
    'https://www.youtube.com/watch?v=d9MyW72ELq0', 
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 
    true, 12.99, 4.99, 7.8, 192, 2022, 'James Cameron', 'Sam Worthington, Zoe Saldana, Sigourney Weaver', 'USA', 'English', true, true, 'PUBLISHED', NOW(), NOW()
),
(
    'm-spiderman', 
    'Spider-Man: Across the Spider-Verse', 
    'spider-man-across-the-spider-verse', 
    'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.', 
    'https://images.unsplash.com/photo-1635805737707-575885ab0820?w=500', 
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200', 
    'https://www.youtube.com/watch?v=cqGjhVJWtEg', 
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 
    false, 0.00, 0.00, 8.7, 140, 2023, 'Joaquim Dos Santos', 'Shameik Moore, Hailee Steinfeld, Oscar Isaac', 'USA', 'English', true, true, 'PUBLISHED', NOW(), NOW()
),
(
    'm-dark-knight', 
    'The Dark Knight: Legacy', 
    'the-dark-knight-legacy', 
    'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological tests.', 
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500', 
    'https://images.unsplash.com/photo-1514533450685-4493e01d1fdc?w=1200', 
    'https://www.youtube.com/watch?v=EXeTwQWrcwY', 
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 
    false, 0.00, 0.00, 9.0, 152, 2021, 'Christopher Nolan', 'Christian Bale, Heath Ledger, Aaron Eckhart', 'USA', 'English', false, true, 'PUBLISHED', NOW(), NOW()
)
ON CONFLICT ("slug") DO NOTHING;

-- 6. Movie Categories & Genres Junctions
INSERT INTO "MovieCategory" ("movieId", "categoryId")
VALUES 
('m-oppenheimer', 'cat-movies'),
('m-avatar', 'cat-movies'),
('m-spiderman', 'cat-movies'),
('m-dark-knight', 'cat-movies')
ON CONFLICT ("movieId", "categoryId") DO NOTHING;

INSERT INTO "MovieGenre" ("movieId", "genreId")
VALUES 
('m-oppenheimer', 'g-drama'),
('m-oppenheimer', 'g-action'),
('m-avatar', 'g-scifi'),
('m-avatar', 'g-action'),
('m-spiderman', 'g-marvel'),
('m-spiderman', 'g-anime'),
('m-dark-knight', 'g-dc'),
('m-dark-knight', 'g-action')
ON CONFLICT ("movieId", "genreId") DO NOTHING;

-- 7. E-Commerce Products
INSERT INTO "Product" ("id", "name", "description", "price", "stock", "image", "status", "category", "rating", "createdAt", "updatedAt")
VALUES 
('p-vip-pass', 'KV Digital Cinema Summer VIP Pass', 'Unlimited 4K IMAX streaming pass for 3 months with 50% discount on merchandise.', 25.99, 100, 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600', 'ACTIVE', 'Memberships', 5.0, NOW(), NOW()),
('p-headphones', 'Pro Wireless Spatial Audio Cinema Headphones', 'Dolby Atmos spatial surround sound wireless cinema headphones with active noise cancellation.', 89.00, 45, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600', 'ACTIVE', 'Electronics', 4.9, NOW(), NOW()),
('p-imax-ticket', 'IMAX 3D Laser Cinema Voucher', 'Single ticket voucher valid for any IMAX 3D movie premiere at KV Digital Cinema.', 12.50, 200, 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600', 'ACTIVE', 'Tickets', 4.8, NOW(), NOW()),
('p-popcorn', 'Gourmet Popcorn & Beverage Combo Pass', 'Large truffle caramel popcorn + 2 jumbo fountain drinks digital redeem code.', 7.99, 300, 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=600', 'ACTIVE', 'Snacks', 4.7, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 8. Sample Podcasts
INSERT INTO "Podcast" ("id", "title", "description", "audioUrl", "coverImage", "duration", "category", "price", "isPremium", "likesCount", "createdAt")
VALUES 
('pod-cinematic', 'The Film Masterclass: Ep 1 - Behind the Lens with Nolan', 'In-depth breakdown of IMAX 70mm cinematography, sound mixing, and storytelling.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=500', 3600, 'Cinema & Arts', 0.00, false, 142, NOW()),
('pod-scifi', 'Future of VFX & AI Cinema 2026', 'Exploring how neural rendering and virtual production are transforming modern cinema.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=500', 2700, 'Technology', 0.00, false, 98, NOW())
ON CONFLICT ("id") DO NOTHING;

-- 9. System Settings
INSERT INTO "Setting" ("id", "key", "value", "description", "updatedAt")
VALUES 
('s-sitename', 'SITE_NAME', 'KV Digital Cinema', 'Website Branding Title', NOW()),
('s-vip-price', 'VIP_ALL_ACCESS_PRICE', '25.00', 'Lifetime / Annual VIP All Access Price', NOW()),
('s-currency', 'DEFAULT_CURRENCY', 'USD', 'Default Platform Currency', NOW())
ON CONFLICT ("key") DO NOTHING;
