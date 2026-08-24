const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendSuccess, sendError } = require('../utils/response');

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    const isVideo = file.mimetype.startsWith('video/') || ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi'].includes(ext);
    const prefix = isVideo ? 'video-' : (file.mimetype.startsWith('audio/') ? 'audio-' : 'media-');
    cb(null, prefix + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi', '.ts', '.flv',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a'
  ];

  if (
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/') ||
    file.mimetype.startsWith('audio/') ||
    allowedExts.includes(ext)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Supported formats: MP4, WebM, MKV, MOV, MP3, JPG, PNG, WebP'), false);
  }
};

// Support up to 1GB video files
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: fileFilter
});

const { isSupabaseConfigured, uploadToSupabaseStorage } = require('../services/supabaseClient');

// Single File / Video Upload Route: POST /api/v1/upload & POST /api/v1/upload/video
const handleUpload = async (req, res) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file) {
      return sendError(res, 'No video or media file uploaded', null, 400);
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const isVideo = file.mimetype.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi'].includes(path.extname(file.filename).toLowerCase());

    let fileUrl = `${protocol}://${host}/uploads/${file.filename}`;
    let relativeUrl = `/uploads/${file.filename}`;
    let storageProvider = 'local';

    // If Supabase Storage is configured and enabled via SUPABASE_STORAGE_BUCKET
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (isSupabaseConfigured() && bucket) {
      try {
        const fileBuffer = fs.readFileSync(file.path);
        const targetPath = `${isVideo ? 'videos' : 'media'}/${file.filename}`;
        const uploadResult = await uploadToSupabaseStorage(bucket, targetPath, fileBuffer, file.mimetype);

        if (uploadResult.success && uploadResult.publicUrl) {
          fileUrl = uploadResult.publicUrl;
          relativeUrl = uploadResult.publicUrl;
          storageProvider = 'supabase';
          console.log(`[Supabase Upload] Successfully stored in bucket "${bucket}": ${uploadResult.publicUrl}`);
        }
      } catch (storageErr) {
        console.warn('[Supabase Storage Warning] Falling back to local storage:', storageErr.message);
      }
    }

    console.log(`[Media Upload] Uploaded ${isVideo ? 'VIDEO' : 'MEDIA'}: ${file.filename} (${(file.size / (1024 * 1024)).toFixed(2)} MB) via ${storageProvider}`);

    return sendSuccess(res, isVideo ? 'Video uploaded successfully' : 'Media uploaded successfully', {
      url: fileUrl,
      relativeUrl: relativeUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      sizeFormatted: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      mimetype: file.mimetype,
      isVideo: isVideo,
      storage: storageProvider
    });
  } catch (err) {
    console.error('[Upload Error]', err.message);
    return sendError(res, 'Upload failed: ' + err.message, null, 500);
  }
};

router.post('/', upload.single('file'), handleUpload);
router.post('/video', upload.single('video'), handleUpload);
router.post('/media', upload.single('file'), handleUpload);

// Range-Aware Video & Audio Streaming Handler: GET /api/v1/upload/stream/:filename
router.get('/stream/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Media file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.mp3') contentType = 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
