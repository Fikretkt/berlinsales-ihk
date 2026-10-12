import packageMetadata from "@/package.json";

// This value is intentionally safe to expose from liveness/readiness endpoints.
// APP_VERSION lets an image build supply a more specific build identifier.
export const APP_VERSION = process.env.APP_VERSION?.trim() || packageMetadata.version;
