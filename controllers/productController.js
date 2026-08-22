const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get Product Catalog
 */
const getProducts = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const where = { status: 'ACTIVE' };

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'Products fetched successfully', products);
  } catch (err) {
    next(err);
  }
};

/**
 * Get Product Detail by ID
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return sendError(res, 'Product not found', null, 404);
    }

    return sendSuccess(res, 'Product retrieved', product);
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Create Product
 */
const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, stock, image, category } = req.body;

    if (!name || !price) {
      return sendError(res, 'Product name and price are required');
    }

    const product = await prisma.product.create({
      data: {
        name,
        description: description || '',
        price: parseFloat(price),
        stock: stock ? parseInt(stock) : 100,
        image: image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
        category: category || 'General'
      }
    });

    return sendSuccess(res, 'Product created successfully', product, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Product
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, image, category, status } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return sendError(res, 'Product not found', null, 404);

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        description: description !== undefined ? description : existing.description,
        price: price !== undefined ? parseFloat(price) : existing.price,
        stock: stock !== undefined ? parseInt(stock) : existing.stock,
        image: image !== undefined ? image : existing.image,
        category: category !== undefined ? category : existing.category,
        status: status !== undefined ? status : existing.status
      }
    });

    return sendSuccess(res, 'Product updated successfully', product);
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Delete Product
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    return sendSuccess(res, 'Product deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
