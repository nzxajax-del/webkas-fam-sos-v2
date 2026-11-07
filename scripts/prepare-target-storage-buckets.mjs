import { createClient } from "@supabase/supabase-js";

const targetUrl = process.env.TARGET_SUPABASE_URL;
const serviceRoleKey = process.env.TARGET_SERVICE_ROLE_KEY;
const expectedTargetUrl = "https://cdqmeenrwsbkcpclitgh.supabase.co";
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

if (targetUrl !== expectedTargetUrl) {
  throw new Error("Refusing to prepare Storage: TARGET_SUPABASE_URL is not the audited target project.");
}
if (!serviceRoleKey) {
  throw new Error("Missing TARGET_SERVICE_ROLE_KEY.");
}

const buckets = [
  { name: "payment-proofs", fileSizeLimit: 5 * 1024 * 1024 },
  { name: "profile-photos", fileSizeLimit: 3 * 1024 * 1024 },
  { name: "registration-proofs", fileSizeLimit: 2 * 1024 * 1024 },
];

const client = createClient(targetUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function inspectBucket(name) {
  const { data, error } = await client.storage.getBucket(name);
  if (error && !/not found|does not exist|404/i.test(error.message || "")) {
    throw new Error(`Cannot inspect target bucket ${name}: ${error.message}`);
  }
  return data || null;
}

for (const bucket of buckets) {
  const existing = await inspectBucket(bucket.name);
  if (!existing) {
    const { error } = await client.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes,
    });
    if (error) throw new Error(`Cannot create private target bucket ${bucket.name}: ${error.message}`);
    process.stdout.write(`Created private bucket: ${bucket.name}\n`);
  } else {
    process.stdout.write(`Bucket already exists: ${bucket.name}\n`);
  }
}

for (const bucket of buckets) {
  const actual = await inspectBucket(bucket.name);
  if (!actual) throw new Error(`Target bucket is missing after preparation: ${bucket.name}`);
  if (actual.public !== false) throw new Error(`Target bucket is not private: ${bucket.name}`);
  if (Number(actual.file_size_limit) !== bucket.fileSizeLimit) {
    throw new Error(`Target bucket has an unexpected file-size limit: ${bucket.name}`);
  }
  const actualMimes = [...(actual.allowed_mime_types || [])].sort();
  if (JSON.stringify(actualMimes) !== JSON.stringify([...allowedMimeTypes].sort())) {
    throw new Error(`Target bucket has unexpected MIME restrictions: ${bucket.name}`);
  }
}

const { data: inventory, error: inventoryError } = await client.storage.listBuckets();
if (inventoryError) throw new Error(`Cannot verify target bucket inventory: ${inventoryError.message}`);
const actualNames = (inventory || []).map((bucket) => bucket.name).sort();
const expectedNames = buckets.map((bucket) => bucket.name).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Target bucket inventory differs from the audited 3-bucket set. Actual: ${actualNames.join(", ")}`);
}

process.stdout.write("Verified all three target buckets are private and match the audited limits and MIME types. No objects were uploaded, overwritten, or deleted.\n");
