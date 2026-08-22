const { verifyAccessToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return sendError(res, 'Access token required. Please login to continue.', null, 401);
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return sendError(res, 'Invalid or expired access token.', null, 401);
  }

  req.user = decoded;
  next();
};

const optionalToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) req.user = decoded;
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalToken
};
