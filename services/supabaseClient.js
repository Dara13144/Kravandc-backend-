const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('[Supabase] Client initialized successfully with URL:', supabaseUrl);
  } catch (err) {
    console.warn('[Supabase] Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('[Supabase] SUPABASE_URL or SUPABASE_KEY not provided. Operating in direct database mode.');
}

/**
 * Check if Supabase client is active
 */
const isSupabaseConfigured = () => !!supabase;

/**
 * Upload file buffer directly to a Supabase Storage bucket
 * @param {string} bucket - Bucket name (e.g. 'kv-media' or 'posters')
 * @param {string} filePath - Target path inside the bucket (e.g. 'movies/poster-123.jpg')
 * @param {Buffer} fileBuffer - File buffer from Multer
 * @param {string} contentType - MIME type (e.g. 'image/jpeg', 'video/mp4')
 * @returns {Promise<{ success: boolean, publicUrl?: string, error?: string }>}
 */
const uploadToSupabaseStorage = async (bucket, filePath, fileBuffer, contentType) => {
  if (!supabase) {
    return { success: false, error: 'Supabase client is not configured' };
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      console.error(`[Supabase Storage Error] ${error.message}`);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      success: true,
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  } catch (err) {
    console.error(`[Supabase Storage Upload Exception]`, err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Get public URL for an existing asset in Supabase storage
 */
const getPublicUrl = (bucket, filePath) => {
  if (!supabase) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data?.publicUrl || null;
};

/**
 * Delete a file from Supabase storage
 */
const deleteFromSupabaseStorage = async (bucket, filePaths) => {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const { data, error } = await supabase.storage.from(bucket).remove(paths);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

module.exports = {
  supabase,
  isSupabaseConfigured,
  uploadToSupabaseStorage,
  getPublicUrl,
  deleteFromSupabaseStorage
};
