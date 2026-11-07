import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const targetUrl = process.env.TARGET_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SERVICE_ROLE_KEY;
const targetKey = process.env.TARGET_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  SOURCE_SUPABASE_URL: sourceUrl,
  TARGET_SUPABASE_URL: targetUrl,
  SOURCE_SERVICE_ROLE_KEY: sourceKey,
  TARGET_SERVICE_ROLE_KEY: targetKey,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

// Profile photos have been retired in the app and are intentionally excluded.
// Keep the legacy source/target bucket untouched as a non-production archive; only
// payment and registration evidence are required for the target cutover.
const bucketConfig = [
  { name: "payment-proofs", fileSizeLimit: 5 * 1024 * 1024 },
  { name: "registration-proofs", fileSizeLimit: 2 * 1024 * 1024 },
];
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const source = createClient(sourceUrl, sourceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const target = createClient(targetUrl, targetKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizePath(folder, name) {
  return folder ? `${folder}/${name}` : name;
}

async function listAllObjects(client, bucket) {
  const files = [];

  async function walk(folder) {
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Cannot list source bucket ${bucket}: ${error.message}`);

      const entries = data || [];
      for (const entry of entries) {
        const path = normalizePath(folder, entry.name);
        if (!entry.id || !entry.metadata) {
          await walk(path);
        } else {
          files.push({
            path,
            size: Number(entry.metadata.size ?? entry.metadata.contentLength ?? 0),
            mimeType: entry.metadata.mimetype || null,
            cacheControl: entry.metadata.cacheControl || "3600",
          });
        }
      }

      if (entries.length < 1000) break;
      offset += entries.length;
    }
  }

  await walk("");
  return files;
}

async function verifySourceBucket(bucket) {
  const { data: existing, error } = await source.storage.getBucket(bucket.name);
  if (error || !existing) {
    throw new Error(`Cannot inspect source bucket ${bucket.name}: ${error?.message || "bucket missing"}`);
  }
  if (existing.public !== false) {
    throw new Error(`Source bucket ${bucket.name} is not private; refusing to change its visibility.`);
  }
  if (Number(existing.file_size_limit) !== bucket.fileSizeLimit) {
    throw new Error(`Source bucket ${bucket.name} file-size limit differs from the audited configuration.`);
  }
  const sourceMimes = [...(existing.allowed_mime_types || [])].sort();
  if (JSON.stringify(sourceMimes) !== JSON.stringify([...allowedMimeTypes].sort())) {
    throw new Error(`Source bucket ${bucket.name} MIME restrictions differ from the audited configuration.`);
  }
}

async function ensurePrivateBucket(bucket) {
  const { data: existing, error: getError } = await target.storage.getBucket(bucket.name);
  if (getError && !/not found|does not exist|404/i.test(getError.message || "")) {
    throw new Error(`Cannot inspect target bucket ${bucket.name}: ${getError.message}`);
  }

  if (!existing) {
    const { error } = await target.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes,
    });
    if (error) throw new Error(`Cannot create private target bucket ${bucket.name}: ${error.message}`);
    return;
  }

  if (existing.public !== false) {
    throw new Error(`Target bucket ${bucket.name} is not private; refusing to continue.`);
  }
  if (Number(existing.file_size_limit) !== bucket.fileSizeLimit) {
    throw new Error(`Target bucket ${bucket.name} has a different file-size limit; refusing to alter it automatically.`);
  }
  const existingMimes = [...(existing.allowed_mime_types || [])].sort();
  if (JSON.stringify(existingMimes) !== JSON.stringify([...allowedMimeTypes].sort())) {
    throw new Error(`Target bucket ${bucket.name} has different MIME restrictions; refusing to alter it automatically.`);
  }
}

async function copyOne(bucket, file) {
  const { data: sourceBlob, error: downloadError } = await source.storage.from(bucket).download(file.path);
  if (downloadError || !sourceBlob) {
    throw new Error(`Source download failed for bucket ${bucket}: ${downloadError?.message || "empty response"}`);
  }

  const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
  const sourceHash = sha256(sourceBuffer);

  const { data: existingBlob, error: existingError } = await target.storage.from(bucket).download(file.path);
  if (!existingError && existingBlob) {
    const existingBuffer = Buffer.from(await existingBlob.arrayBuffer());
    if (sha256(existingBuffer) !== sourceHash) {
      throw new Error(`Target object differs from source at bucket ${bucket}; refusing to overwrite.`);
    }
    return { bytes: sourceBuffer.length, alreadyPresent: true };
  }

  const contentType = file.mimeType || sourceBlob.type || "application/octet-stream";
  const { error: uploadError } = await target.storage.from(bucket).upload(file.path, sourceBuffer, {
    upsert: false,
    contentType,
    cacheControl: file.cacheControl,
  });
  if (uploadError) {
    // A concurrent/retried upload is accepted only if the existing target bytes match.
    const { data: retryBlob, error: retryError } = await target.storage.from(bucket).download(file.path);
    if (retryError || !retryBlob) {
      throw new Error(`Target upload failed for bucket ${bucket}: ${uploadError.message}`);
    }
    const retryBuffer = Buffer.from(await retryBlob.arrayBuffer());
    if (sha256(retryBuffer) !== sourceHash) {
      throw new Error(`Target upload conflict for bucket ${bucket}; target bytes do not match source.`);
    }
  }

  const { data: verifyBlob, error: verifyError } = await target.storage.from(bucket).download(file.path);
  if (verifyError || !verifyBlob) {
    throw new Error(`Target verification download failed for bucket ${bucket}: ${verifyError?.message || "empty response"}`);
  }
  const targetBuffer = Buffer.from(await verifyBlob.arrayBuffer());
  if (sha256(targetBuffer) !== sourceHash) {
    throw new Error(`SHA-256 verification failed for bucket ${bucket}.`);
  }

  return { bytes: sourceBuffer.length, alreadyPresent: false };
}

async function runPool(items, concurrency, worker) {
  let next = 0;
  const results = [];
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// Prepare every private target bucket before inspecting the source Storage API.
 // This leaves the target structurally ready even if the source project is quota-restricted.
for (const bucket of bucketConfig) {
  await ensurePrivateBucket(bucket);
}

// Verify all source bucket settings only after target preparation is complete.
for (const bucket of bucketConfig) {
  await verifySourceBucket(bucket);
}

const report = [];
for (const bucket of bucketConfig) {
  const files = await listAllObjects(source, bucket.name);
  const results = await runPool(files, 3, (file) => copyOne(bucket.name, file));
  const targetFiles = await listAllObjects(target, bucket.name);
  const sourceInventory = files
    .map((file) => ({ path: file.path, size: file.size, mimeType: file.mimeType, cacheControl: file.cacheControl }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const targetInventory = targetFiles
    .map((file) => ({ path: file.path, size: file.size, mimeType: file.mimeType, cacheControl: file.cacheControl }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(sourceInventory) !== JSON.stringify(targetInventory)) {
    throw new Error(`Object path/metadata inventory mismatch in bucket ${bucket.name}; refusing to mark transfer complete.`);
  }

  const bytes = results.reduce((sum, item) => sum + item.bytes, 0);
  const targetBytes = targetFiles.reduce((sum, file) => sum + file.size, 0);
  if (bytes !== targetBytes) {
    throw new Error(`Object byte-count mismatch in bucket ${bucket.name}: source ${bytes}, target ${targetBytes}.`);
  }

  const existing = results.filter((item) => item.alreadyPresent).length;
  report.push({ bucket: bucket.name, objects: files.length, bytes, alreadyPresent: existing });
}

for (const row of report) {
  process.stdout.write(`Verified ${row.bucket}: ${row.objects} objects, ${row.bytes} bytes, ${row.alreadyPresent} already present.\n`);
}
process.stdout.write("Storage transfer finished. All copied objects passed SHA-256 verification; no source objects were modified.\n");
