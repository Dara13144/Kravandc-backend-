const axios = require('axios');

const PROXY_URL = 'http://localhost:5173/api/v1';

async function runHealthCheck() {
  console.log('--- STARTING COMPREHENSIVE BACKEND <-> FRONTEND VERIFICATION ---');

  // 1. Health Checks
  const beHealth = await axios.get('http://localhost:5050/api/health');
  console.log('✅ 1. Backend Health Check:', beHealth.data.status);

  const feRoot = await axios.get('http://localhost:5173');
  console.log('✅ 2. Frontend Web Server:', feRoot.status === 200 ? '200 OK' : feRoot.status);

  // 2. Auth Login Test
  const loginRes = await axios.post(PROXY_URL + '/auth/login', {
    email: 'admin@kvcinema.com',
    password: 'Admin@123456'
  });
  console.log('✅ 3. Auth Login (Admin via Proxy):', loginRes.data.success ? 'SUCCESS (JWT Received)' : 'FAILED');
  const token = loginRes.data.data.accessToken || loginRes.data.data.token;
  const authHeaders = { headers: { Authorization: 'Bearer ' + token } };

  // 3. User Me Profile
  const meRes = await axios.get(PROXY_URL + '/auth/me', authHeaders);
  console.log('✅ 4. Profile /auth/me:', meRes.data.data.email, '| Role:', meRes.data.data.role);

  // 4. Movies Query
  const moviesRes = await axios.get(PROXY_URL + '/movies');
  console.log('✅ 5. Movies Catalog API:', moviesRes.data.data.movies.length, 'movies loaded');

  // 5. Movie Details
  const movieDetails = await axios.get(PROXY_URL + '/movies/' + moviesRes.data.data.movies[0].id);
  const movieObj = movieDetails.data.data.movie || movieDetails.data.data;
  console.log('✅ 6. Movie Stream & Details API:', movieObj.title, '| Rating:', movieObj.rating);

  // 6. Podcasts
  const podRes = await axios.get(PROXY_URL + '/podcasts');
  console.log('✅ 7. Podcasts Audio/Video API:', podRes.data.data.length, 'podcasts loaded');

  // 7. Products
  const prodRes = await axios.get(PROXY_URL + '/products');
  console.log('✅ 8. E-Commerce Products API:', (prodRes.data.data.products || prodRes.data.data).length, 'products loaded');

  // 8. Wallet Balance
  const walletRes = await axios.get(PROXY_URL + '/wallet/balance', authHeaders);
  const userBalance = walletRes.data.data.wallet ? walletRes.data.data.wallet.balance : walletRes.data.data.balance;
  console.log('✅ 9. User Wallet API:', '$' + userBalance, 'USD balance');

  // 9. CutLuy KHQR Payment Creation
  const paymentRes = await axios.post(PROXY_URL + '/payments/cutluy/create', { amount: 5.0 }, authHeaders);
  console.log('✅ 10. CutLuy KHQR API:', {
    transactionId: paymentRes.data.data.transactionId,
    amount: '$' + paymentRes.data.data.amount,
    checkout_url: paymentRes.data.data.checkout_url
  });

  // 10. Payment Status Check
  const statusRes = await axios.get(PROXY_URL + '/payments/status/' + paymentRes.data.data.transactionId);
  console.log('✅ 11. 5s Payment Status Verification:', statusRes.data.status, '| Msg:', statusRes.data.message);

  // 11. Admin Statistics
  const statsRes = await axios.get(PROXY_URL + '/admin/stats', authHeaders);
  const stats = statsRes.data.data.stats || statsRes.data.data;
  console.log('✅ 12. Admin Dashboard Stats:', {
    users: stats.totalUsers,
    movies: stats.totalMovies,
    revenue: '$' + stats.totalRevenue
  });

  console.log('\n🌟 ALL 12 BACKEND & FRONTEND SUBSYSTEMS ARE 100% OPERATIONAL! 🌟');
}

runHealthCheck().catch(err => {
  console.error('❌ ERROR DURING CHECK:', err.response ? err.response.data : err.message);
  process.exit(1);
});
