const { sendError } = require('../utils/response');
const prisma = require('../utils/prisma');

const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Unauthorized access', null, 401);
    }

    let role = req.user.role;

    // If role in token is not in allowedRoles, query live database to check updated role
    if (!allowedRoles.includes(role) && req.user.id) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { role: true }
        });
        if (dbUser?.role) {
          role = dbUser.role;
          req.user.role = role; // update session role
        }
      } catch (e) {}
    }

    if (!allowedRoles.includes(role)) {
      return sendError(
        res,
        `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`,
        null,
        403
      );
    }

    next();
  };
};

module.exports = {
  authorizeRoles
};
