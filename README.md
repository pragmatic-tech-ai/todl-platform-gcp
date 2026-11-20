> Archived 2026-11-20: moved to pragmatic-shared (packages/pragmatic-realm-gcp) as @pragmatic-tech-ai/pragmatic-realm-gcp.
>
> The package @pragmatic-tech-ai/todl-platform-gcp is retired. GitHub Packages does not support npm deprecate, so its published versions carry no deprecation flag; use the new package.

# todl-platform-gcp

GCP-backed platform adapters: `GcsObjectStore` (an `IStorage` over Google Cloud Storage via the narrow
`IGcsBucket` seam) and `GcsStorageProviderRegistry`.

## Tests

`npm test` runs everything with no Docker. The fake-backed conformance suite always runs; the live
conformance test is gated on `PRAGMATIC_TEST_GCS_ENDPOINT` and skips cleanly when it is unset.

Both drive the same shared suite (`src/testing/istorage-conformance.ts`), so the real
`@google-cloud/storage` client and `RealGcsBucket` are held to the same behaviour as the in-memory fake.

## Running the gated emulator test

```
docker compose -f docker-compose.emulators.yml up -d
PRAGMATIC_TEST_GCS_ENDPOINT=http://localhost:4443 npx tsx --test src/storage/tests/gcs-object-store-live.test.ts
docker compose -f docker-compose.emulators.yml down
```

The compose file starts `fsouza/fake-gcs-server` over plain HTTP on port 4443 and pre-creates the
`pragmatic-test` bucket by mounting `docker/gcs-seed` (each top-level directory there becomes a bucket).
Set `PRAGMATIC_TEST_GCS_BUCKET` to target a different bucket. Each case writes under its own random
`run-<id>/` key prefix and deletes it afterwards.

## Running the gated Secret Manager test

src/secrets/tests/gcp-secret-manager-live.test.ts drives GcpSecretManagerSecretStore through the real
@google-cloud/secret-manager SDK and RealSecretManagerClient. It skips unless
PRAGMATIC_TEST_GCP_SECRET_ENDPOINT is set (host:port or http://host:port).

Against a plaintext-gRPC emulator such as blackwell-systems/gcp-secret-manager-emulator or localgcp:

```
PRAGMATIC_TEST_GCP_SECRET_ENDPOINT=localhost:9090 npx tsx --test src/secrets/tests/gcp-secret-manager-live.test.ts
```

Set PRAGMATIC_TEST_GCP_PROJECT to choose the project id (default test-project). The test connects with
insecure (plaintext) gRPC credentials via @grpc/grpc-js (a dev dependency used only by this test), so it
targets emulators or a plaintext proxy in front of a real GCP project (with Application Default
Credentials on that proxy); use a throwaway project. Each case uses its own random run-<id>/ reference
prefix and deletes every secret it created afterwards; a cleanup failure never masks an assertion failure.
